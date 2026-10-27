using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
using Microsoft.Win32;

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

        // The cached policy the Agent is running with. The server remains the
        // authority: it overwrites this list on the next Agent start.
        public List<string> AllowedSources()
        {
            List<string> sources = new List<string>();
            Dictionary<string, object> config = ReadConfig();
            if (config == null)
            {
                return sources;
            }
            List<object> values = Json.Arr(config, "allowedSources");
            if (values == null)
            {
                return sources;
            }
            foreach (object value in values)
            {
                string name = value as string;
                if (!string.IsNullOrEmpty(name))
                {
                    sources.Add(name);
                }
            }
            return sources;
        }

        // Only the Owner may widen the allowlist, so the tray deep-links to the
        // dashboard instead of writing config.json behind the server's back.
        public string SettingsUrl(string languageCode)
        {
            string endpoint = Endpoint();
            if (string.IsNullOrEmpty(endpoint))
            {
                return null;
            }
            return endpoint.TrimEnd('/') + "/" + languageCode + "/settings?section=account";
        }

        public bool IsRunning()
        {
            CliResult status = Run(new string[] { "status", "--state", StateDirectory });
            try
            {
                Dictionary<string, object> map = Json.AsObject(Json.Parse((status.StdOut ?? string.Empty).Trim()));
                return Json.Bool(map, "running");
            }
            catch
            {
                return false;
            }
        }

        // The CLI's `stop` is queued and only accepted while the instance pipe is
        // reachable. A pipe owned by a higher-integrity process (an Agent started
        // from an elevated shell) is invisible here, so report that case instead
        // of waiting for a stop that cannot arrive.
        public bool Restart(out string error, out bool timedOut)
        {
            error = null;
            timedOut = false;
            StatusSnapshot before = StatusSnapshot.Load(StateDirectory);
            bool daemonAlive = before != null && before.IsFresh(NowMs());
            CliResult stop = Run(new string[] { "stop", "--state", StateDirectory });
            bool pipe = IsRunning();
            if (!stop.Ok && pipe)
            {
                error = "AGENT_STOP_REJECTED";
                return false;
            }
            if (!stop.Ok && daemonAlive && !pipe)
            {
                error = "AGENT_UNREACHABLE";
                return false;
            }

            // The daemon writes running:false in its shutdown path, so the state
            // file is a cheap and accurate "has it left" signal while it drains a
            // collection cycle.
            bool exited = !daemonAlive;
            for (int attempt = 0; attempt < 120 && !exited; attempt++)
            {
                Thread.Sleep(750);
                StatusSnapshot current = StatusSnapshot.Load(StateDirectory);
                if (current == null || !current.Running)
                {
                    exited = true;
                }
            }
            if (!exited)
            {
                timedOut = true;
                error = "AGENT_DID_NOT_STOP";
                return false;
            }
            Thread.Sleep(500);

            // A supervisor exits immediately when the old daemon still holds the
            // lock, so retry until one survives.
            for (int attempt = 0; attempt < 8; attempt++)
            {
                if (StartSupervisorAlive(out error))
                {
                    return true;
                }
                Thread.Sleep(1500);
            }
            timedOut = true;
            error = "AGENT_DID_NOT_START";
            return false;
        }

        // The supervisor keeps running while its daemon lives; a supervisor that
        // exits within two seconds means the instance lock was still taken.
        private bool StartSupervisorAlive(out string error)
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
                using (Process process = Process.Start(info))
                {
                    if (process == null)
                    {
                        error = "SUPERVISOR_NOT_STARTED";
                        return false;
                    }
                    return !process.WaitForExit(2000);
                }
            }
            catch (Exception failure)
            {
                error = failure.Message;
                return false;
            }
        }

        private static long NowMs()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
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

        public const string AutoStartArguments = "--no-show";
        private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "InceptSync";

        public static string StartupShortcutPath()
        {
            string folder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            return Path.Combine(folder, "Incept Sync.lnk");
        }

        public static bool IsAutoStartEnabled()
        {
            return File.Exists(StartupShortcutPath()) || RunEntryExists();
        }

        public static string BuildAutoStartCommand(string executablePath)
        {
            return Quote(executablePath) + " " + AutoStartArguments;
        }

        private static bool RunEntryExists()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, false))
                {
                    if (key == null)
                    {
                        return false;
                    }
                    string value = key.GetValue(RunValueName) as string;
                    return !string.IsNullOrEmpty(value);
                }
            }
            catch
            {
                return false;
            }
        }

        private static void DeleteRunEntry()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKeyPath, true))
            {
                if (key != null)
                {
                    key.DeleteValue(RunValueName, false);
                }
            }
        }

        // User-initiated only: the settings dialog calls this when the checkbox
        // changes. Nothing installs a logon entry automatically.
        //
        // Both triggers are current-user only and need no administrator:
        // - the Startup-folder shortcut is the existing mechanism;
        // - the HKCU Run entry is a second trigger because Explorer has been
        //   observed to skip the Startup folder on some logons.
        // Both pass --no-show so the duplicate instance exits without popping
        // the status card open.
        public static void SetAutoStart(bool enabled, string executablePath)
        {
            string shortcutPath = StartupShortcutPath();
            if (!enabled)
            {
                if (File.Exists(shortcutPath))
                {
                    File.Delete(shortcutPath);
                }
                DeleteRunEntry();
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
            shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { AutoStartArguments });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { Path.GetDirectoryName(executablePath) });
            shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "Incept Sync Agent tray" });
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { executablePath + ",0" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);

            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKeyPath))
            {
                if (key == null)
                {
                    throw new InvalidOperationException("Run key unavailable");
                }
                key.SetValue(RunValueName, BuildAutoStartCommand(executablePath), RegistryValueKind.String);
            }
        }
    }
}
