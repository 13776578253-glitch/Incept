using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace InceptSync
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Options options = Options.Parse(args);
            ThemeManager.Initialize(options.StateDirectory);
            Locale.Initialize(options.StateDirectory);
            if (!string.IsNullOrEmpty(options.SelfTestPath))
            {
                return SelfTest.Run(options);
            }
            string pipeName = Pipe.NameFor(options.StateDirectory);
            bool created;
            using (Mutex mutex = new Mutex(true, "Local\\" + pipeName + "-mutex", out created))
            {
                if (!created)
                {
                    Pipe.Notify(pipeName);
                    return 0;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                TrayContext context = new TrayContext(options);
                context.Start();
                Application.Run(context);
            }
            return 0;
        }
    }

    // Headless verification hook: proves the tray talks to the real CLI without
    // clicking the UI. Writes one JSON file and returns an exit code.
    internal static class SelfTest
    {
        public static int Run(Options options)
        {
            AgentClient agent = new AgentClient(options.AgentDirectory, options.StateDirectory);
            Dictionary<string, object> result = new Dictionary<string, object>();
            result["node"] = agent.HasNode;
            result["agentScript"] = File.Exists(agent.AgentScript);
            result["configured"] = agent.IsConfigured;

            CliResult status = agent.Run("status", "--state", options.StateDirectory);
            result["statusExit"] = status.ExitCode;
            result["statusOut"] = (status.StdOut ?? string.Empty).Trim();
            result["statusErr"] = (status.StdErr ?? string.Empty).Trim();
            result["statusError"] = status.Error;
            result["running"] = ReadBool(status.StdOut, "running");
            result["pausedBefore"] = ReadBool(status.StdOut, "paused");

            if (agent.IsConfigured)
            {
                CliResult pause = agent.Run("pause", "--state", options.StateDirectory);
                result["pauseExit"] = pause.ExitCode;
                StatusSnapshot paused = StatusSnapshot.Load(options.StateDirectory);
                result["pausedAfterPause"] = paused != null && paused.Paused;

                CliResult resume = agent.Run("resume", "--state", options.StateDirectory);
                result["resumeExit"] = resume.ExitCode;
                StatusSnapshot resumed = StatusSnapshot.Load(options.StateDirectory);
                result["pausedAfterResume"] = resumed != null && resumed.Paused;

                if (ReadBool(status.StdOut, "running"))
                {
                    CliResult sync = agent.Run("sync-now", "--state", options.StateDirectory);
                    result["syncNowExit"] = sync.ExitCode;
                    result["syncNowQueued"] = sync.StdOut != null && sync.StdOut.IndexOf("queued", StringComparison.OrdinalIgnoreCase) >= 0;
                    Thread.Sleep(1500);
                    StatusSnapshot afterSync = StatusSnapshot.Load(options.StateDirectory);
                    result["lastCollectedAt"] = afterSync == null ? null : afterSync.LastCollectedAt;
                }
            }

            string json = Json.Serialize(result);
            File.WriteAllText(options.SelfTestPath, json, new UTF8Encoding(false));
            return 0;
        }

        private static bool ReadBool(string stdout, string key)
        {
            try
            {
                Dictionary<string, object> map = Json.AsObject(Json.Parse(stdout.Trim()));
                return Json.Bool(map, key);
            }
            catch
            {
                return false;
            }
        }
    }
}
