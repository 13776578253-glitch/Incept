using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;

namespace InceptSync
{
    internal sealed class CliResult
    {
        public int ExitCode;
        public string StdOut = string.Empty;
        public string StdErr = string.Empty;
        public bool TimedOut;
        public string Error;

        public bool Ok
        {
            get { return Error == null && !TimedOut && ExitCode == 0; }
        }
    }

    // Thin wrapper around the existing Node CLI. The tray never re-implements
    // collection, upload, auth or scheduling: it only runs documented commands
    // and reads status.json.
    internal sealed class AgentClient
    {
        public readonly string AgentDirectory;
        public readonly string StateDirectory;
        public readonly string NodePath;

        public AgentClient(string agentDirectory, string stateDirectory)
        {
            AgentDirectory = agentDirectory;
            StateDirectory = stateDirectory;
            NodePath = ResolveNode();
        }

        public string AgentScript
        {
            get { return Path.Combine(AgentDirectory, "agent.mjs"); }
        }

        public bool HasNode
        {
            get { return !string.IsNullOrEmpty(NodePath) && File.Exists(NodePath); }
        }

        public bool IsConfigured
        {
            get { return File.Exists(Path.Combine(StateDirectory, "config.json")); }
        }

        public static string ResolveNode()
        {
            string path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            foreach (string entry in path.Split(';'))
            {
                if (entry.Trim().Length == 0)
                {
                    continue;
                }
                try
                {
                    string candidate = Path.Combine(entry.Trim(), "node.exe");
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch
                {
                }
            }
            string[] fixedPaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                @"C:\nvm4w\nodejs\node.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
            };
            foreach (string candidate in fixedPaths)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return "node.exe";
        }

        public CliResult Run(params string[] args)
        {
            CliResult result = new CliResult();
            if (!HasNode)
            {
                result.Error = "NODE_NOT_FOUND";
                return result;
            }
            if (!File.Exists(AgentScript))
            {
                result.Error = "AGENT_NOT_FOUND";
                return result;
            }
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(NodePath, Quote(AgentScript) + " " + BuildArguments(args));
                info.CreateNoWindow = true;
                info.UseShellExecute = false;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                info.StandardOutputEncoding = Encoding.UTF8;
                info.StandardErrorEncoding = Encoding.UTF8;
                info.WorkingDirectory = AgentDirectory;
                using (Process process = new Process())
                {
                    process.StartInfo = info;
                    StringBuilder stdout = new StringBuilder();
                    StringBuilder stderr = new StringBuilder();
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null)
                        {
                            stdout.AppendLine(e.Data);
                        }
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null)
                        {
                            stderr.AppendLine(e.Data);
                        }
                    };
                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                    if (!process.WaitForExit(30000))
                    {
                        result.TimedOut = true;
                        try
                        {
                            process.Kill();
                        }
                        catch
                        {
                        }
                    }
                    else
                    {
                        process.WaitForExit();
                    }
                    result.StdOut = stdout.ToString();
                    result.StdErr = stderr.ToString();
                    result.ExitCode = result.TimedOut ? -1 : process.ExitCode;
                }
            }
            catch (Exception error)
            {
                result.Error = error.GetType().Name;
            }
            return result;
        }

        public void RunAsync(string[] args, Action<CliResult> completed)
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                CliResult result = Run(args);
                if (completed != null)
                {
                    completed(result);
                }
            });
        }

        public bool StartSupervisor(out string error)
        {
            error = null;
            try
            {
                string arguments = Quote(AgentScript) + " " + BuildArguments(new string[] { "supervise", "--state", StateDirectory });
                ProcessStartInfo info = new ProcessStartInfo(NodePath, arguments);
                info.CreateNoWindow = true;
                info.UseShellExecute = false;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                info.WorkingDirectory = AgentDirectory;
                Process.Start(info);
                return true;
            }
            catch (Exception failure)
            {
                error = failure.Message;
                return false;
            }
        }

        public Dictionary<string, object> ReadConfig()
        {
            try
            {
                string path = Path.Combine(StateDirectory, "config.json");
                if (!File.Exists(path))
                {
                    return null;
                }
                using (StreamReader reader = new StreamReader(path, Encoding.UTF8))
                {
                    return Json.AsObject(Json.Parse(reader.ReadToEnd()));
                }
            }
            catch
            {
                return null;
            }
        }

        public string Endpoint()
        {
            Dictionary<string, object> config = ReadConfig();
            return Json.Str(config, "endpoint") ?? string.Empty;
        }

        public string DeviceId()
        {
            Dictionary<string, object> config = ReadConfig();
            return Json.Str(config, "deviceId") ?? string.Empty;
        }

        private static string BuildArguments(string[] args)
        {
            StringBuilder builder = new StringBuilder();
            foreach (string arg in args)
            {
                if (builder.Length > 0)
                {
                    builder.Append(' ');
                }
                builder.Append(Quote(arg));
            }
            return builder.ToString();
        }

        private static string Quote(string value)
        {
            if (value == null)
            {
                return "\"\"";
            }
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        public static string StartupShortcutPath()
        {
            string folder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            return Path.Combine(folder, "Incept Sync.lnk");
        }

        public static bool IsAutoStartEnabled()
        {
            return File.Exists(StartupShortcutPath());
        }

        // User-initiated only: the settings dialog calls this when the checkbox
        // changes. Nothing installs a logon entry automatically.
        public static void SetAutoStart(bool enabled, string executablePath)
        {
            string shortcutPath = StartupShortcutPath();
            if (!enabled)
            {
                if (File.Exists(shortcutPath))
                {
                    File.Delete(shortcutPath);
                }
                return;
            }
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                throw new InvalidOperationException("WScript.Shell unavailable");
            }
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { executablePath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { Path.GetDirectoryName(executablePath) });
            shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "Incept Sync Agent tray" });
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { executablePath + ",0" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
    }
}
