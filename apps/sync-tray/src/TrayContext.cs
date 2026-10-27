using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace InceptSync
{
    internal sealed class Options
    {
        public string StateDirectory;
        public string AgentDirectory;
        public bool ShowPanel;
        public bool NoShow;
        public bool NoAgentStart;
        public string SelfTestPath;
        public string Dialog;

        public static Options Parse(string[] args)
        {
            Options options = new Options();
            options.StateDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Incept", "sync-agent");
            string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string packaged = Path.Combine(baseDirectory, "agent");
            options.AgentDirectory = Directory.Exists(packaged) ? packaged : baseDirectory;
            for (int index = 0; index < args.Length; index++)
            {
                string arg = args[index];
                if (arg == "--state" && index + 1 < args.Length)
                {
                    options.StateDirectory = Path.GetFullPath(args[++index]);
                }
                else if (arg == "--agent-dir" && index + 1 < args.Length)
                {
                    options.AgentDirectory = Path.GetFullPath(args[++index]);
                }
                else if (arg == "--show")
                {
                    options.ShowPanel = true;
                }
                else if (arg == "--no-show")
                {
                    options.NoShow = true;
                }
                else if (arg == "--no-agent-start")
                {
                    options.NoAgentStart = true;
                }
                else if (arg == "--dialog" && index + 1 < args.Length)
                {
                    options.Dialog = args[++index];
                }
                else if (arg == "--selftest" && index + 1 < args.Length)
                {
                    options.SelfTestPath = Path.GetFullPath(args[++index]);
                }
            }
            return options;
        }
    }

    internal static class Pipe
    {
        public static string NameFor(string stateDirectory)
        {
            string normalized = stateDirectory.ToLowerInvariant();
            byte[] digest;
            using (SHA256 sha = SHA256.Create())
            {
                digest = sha.ComputeHash(Encoding.UTF8.GetBytes(normalized));
            }
            StringBuilder builder = new StringBuilder("incept-sync-tray-");
            for (int index = 0; index < 8; index++)
            {
                builder.Append(digest[index].ToString("x2"));
            }
            return builder.ToString();
        }

        public static void Notify(string name)
        {
            try
            {
                using (NamedPipeClientStream client = new NamedPipeClientStream(".", name, PipeDirection.Out))
                {
                    client.Connect(800);
                    using (StreamWriter writer = new StreamWriter(client, Encoding.UTF8))
                    {
                        writer.WriteLine("show");
                        writer.Flush();
                    }
                }
            }
            catch
            {
            }
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private readonly Options _options;
        private readonly AgentClient _agent;
        private readonly NotifyIcon _icon;
        private readonly System.Windows.Forms.Timer _timer;
        private readonly System.Windows.Forms.Timer _animationTimer;
        private readonly Palette _palette = Palette.Current();
        private readonly Queue<Action> _uiQueue = new Queue<Action>();
        private readonly object _uiLock = new object();
        private StatusSnapshot _snapshot;
        private AgentVisualState _lastState = AgentVisualState.Offline;
        private string _lastError;
        private StatusPopup _popup;
        private int _animationFrame;

        public TrayContext(Options options)
        {
            _options = options;
            _agent = new AgentClient(options.AgentDirectory, options.StateDirectory);

            _icon = new NotifyIcon();
            _icon.Icon = IconFactory.For(AgentVisualState.Offline, _palette.Dark);
            _icon.Text = "Incept Sync Agent";
            _icon.Visible = true;
            _icon.MouseClick += OnIconClick;
            ThemeManager.Changed += OnThemeChanged;
            Locale.Changed += OnLocaleChanged;

            _timer = new System.Windows.Forms.Timer();
            _timer.Interval = 1000;
            _timer.Tick += delegate { Refresh(); };
            _animationTimer = new System.Windows.Forms.Timer();
            _animationTimer.Interval = 120;
            _animationTimer.Tick += delegate
            {
                _animationFrame = (_animationFrame + 1) % IconFactory.SpinnerFrameCount;
                _icon.Icon = IconFactory.For(AgentVisualState.Syncing, _palette.Dark, _animationFrame);
                if (_popup != null && !_popup.IsDisposed) _popup.UpdateSnapshot(_snapshot, _animationFrame);
            };
        }

        public void Start()
        {
            Refresh();
            EnsureAgent();
            _timer.Start();
            StartPipeServer();
            if (_options.ShowPanel)
            {
                Post(ShowPopup);
            }
            if (_options.Dialog == "exit")
            {
                Post(delegate { using (ExitDialog dialog = new ExitDialog(0)) { dialog.ShowDialog(); } });
            }
            else if (_options.Dialog == "settings")
            {
                Post(delegate { using (SettingsForm form = new SettingsForm(_agent)) { form.ShowDialog(); } });
            }
        }

        private void Post(Action action)
        {
            lock (_uiLock)
            {
                _uiQueue.Enqueue(action);
            }
        }

        private void DrainQueue()
        {
            while (true)
            {
                Action action = null;
                lock (_uiLock)
                {
                    if (_uiQueue.Count == 0)
                    {
                        break;
                    }
                    action = _uiQueue.Dequeue();
                }
                try
                {
                    action();
                }
                catch
                {
                }
            }
        }

        private void Refresh()
        {
            DrainQueue();
            ThemeManager.RefreshSystem();
            _snapshot = StatusSnapshot.Load(_agent.StateDirectory);
            long now = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            AgentVisualState state = _snapshot == null ? AgentVisualState.Offline : _snapshot.VisualState(now);
            if (state != _lastState)
            {
                _animationFrame = 0;
                _icon.Icon = IconFactory.For(state, _palette.Dark);
                _lastState = state;
            }
            _animationTimer.Enabled = state == AgentVisualState.Syncing;
            if (_popup != null && !_popup.IsDisposed) _popup.UpdateSnapshot(_snapshot, _animationFrame);
            _icon.Text = Tooltip(state);
            if (state == AgentVisualState.Attention && _snapshot.LastErrorCode != _lastError)
            {
                _lastError = _snapshot.LastErrorCode;
                Notify(Strings.AttentionTitle, _snapshot.LastErrorCode + Strings.AttentionSuffix, ToolTipIcon.Warning);
            }
            else if (state != AgentVisualState.Attention)
            {
                _lastError = null;
            }
        }

        private void OnThemeChanged(object sender, EventArgs e)
        {
            Palette.Current();
            _icon.Icon = IconFactory.For(_lastState, _palette.Dark, _animationFrame);
        }

        private void OnLocaleChanged(object sender, EventArgs e)
        {
            _icon.Text = Tooltip(_lastState);
        }

        private string Tooltip(AgentVisualState state)
        {
            string text;
            switch (state)
            {
                case AgentVisualState.Connected: text = Strings.TrayRunning; break;
                case AgentVisualState.Syncing: text = Strings.TrayUploading; break;
                case AgentVisualState.Paused: text = Strings.TrayPaused; break;
                case AgentVisualState.Attention: text = Strings.TrayAttention; break;
                default: text = Strings.TrayOffline; break;
            }
            string value = "Incept Sync · " + text;
            return value.Length > 63 ? value.Substring(0, 63) : value;
        }

        private void EnsureAgent()
        {
            if (!_agent.IsConfigured)
            {
                Notify(Strings.NotBoundTitle, Strings.NotBoundText, ToolTipIcon.Info);
                return;
            }
            if (_snapshot != null && _snapshot.IsFresh(NowMs()))
            {
                return;
            }
            _agent.RunAsync(new string[] { "status", "--state", _agent.StateDirectory }, delegate(CliResult result)
            {
                bool running = ParseRunning(result.StdOut);
                if (!running && !_options.NoAgentStart)
                {
                    string error;
                    if (_agent.StartSupervisor(out error))
                    {
                        Post(delegate { Notify(Strings.StartedTitle, Strings.StartedText, ToolTipIcon.Info); });
                    }
                    else
                    {
                        Post(delegate { Notify(Strings.StartFailedTitle, error, ToolTipIcon.Error); });
                    }
                }
            });
        }

        private static bool ParseRunning(string stdout)
        {
            try
            {
                Dictionary<string, object> map = Json.AsObject(Json.Parse(stdout.Trim()));
                return Json.Bool(map, "running");
            }
            catch
            {
                return false;
            }
        }

        private void OnIconClick(object sender, MouseEventArgs e)
        {
            ShowPopup();
        }

        private void ShowPopup()
        {
            if (_popup != null && !_popup.IsDisposed)
            {
                _popup.ShowAnchored(_icon);
                return;
            }
            _snapshot = StatusSnapshot.Load(_agent.StateDirectory);
            StatusPopup popup = new StatusPopup(_agent, _snapshot);
            _popup = popup;
            popup.SyncRequested = SyncNow;
            popup.DashboardRequested = OpenDashboard;
            popup.PauseRequested = TogglePause;
            popup.LogRequested = OpenLog;
            popup.SettingsRequested = OpenSettings;
            popup.QuitRequested = Quit;
            popup.ShowAnchored(_icon);
            if (Environment.GetEnvironmentVariable("INCEPT_TRAY_DEBUG") == "1")
            {
                try
                {
                    File.AppendAllText(Path.Combine(Path.GetTempPath(), "incept-tray-debug.log"),
                        string.Format("{0} bounds={1} client={2} dpi={3} state={4} primary={5} work={6} virtual={7} cursor={8}{9}",
                            DateTime.Now.ToString("HH:mm:ss.fff"), popup.Bounds, popup.ClientSize, popup.DeviceDpi,
                            _snapshot == null ? "null" : _snapshot.VisualState(NowMs()).ToString(),
                            Screen.PrimaryScreen.Bounds, Screen.PrimaryScreen.WorkingArea,
                            SystemInformation.VirtualScreen, Cursor.Position, Environment.NewLine));
                }
                catch
                {
                }
            }
        }

        private void SyncNow()
        {
            _snapshot = StatusSnapshot.Load(_agent.StateDirectory);
            if (_snapshot == null || !_snapshot.IsFresh(NowMs()))
            {
                EnsureAgent();
                Notify(Strings.AgentStoppedTitle, Strings.AgentStoppedText, ToolTipIcon.Info);
                return;
            }
            _agent.RunAsync(new string[] { "sync-now", "--state", _agent.StateDirectory }, delegate(CliResult result)
            {
                string message = result.Ok ? Strings.SyncQueued : Strings.SyncFailedPrefix + Describe(result);
                Post(delegate { Notify(Strings.SyncNow, message, result.Ok ? ToolTipIcon.Info : ToolTipIcon.Warning); });
            });
        }

        private void TogglePause()
        {
            bool pause = _snapshot == null || !_snapshot.Paused;
            string command = pause ? "pause" : "resume";
            _agent.RunAsync(new string[] { command, "--state", _agent.StateDirectory }, delegate(CliResult result)
            {
                Post(delegate
                {
                    Notify(pause ? Strings.PausedTitle : Strings.ResumedTitle,
                        result.Ok ? (pause ? Strings.PausedText : Strings.ResumedText) : Describe(result),
                        result.Ok ? ToolTipIcon.Info : ToolTipIcon.Warning);
                });
            });
        }

        private void OpenDashboard()
        {
            string endpoint = _agent.Endpoint();
            if (string.IsNullOrEmpty(endpoint))
            {
                Notify(Strings.NoEndpointTitle, Strings.NoEndpointText, ToolTipIcon.Warning);
                return;
            }
            try
            {
                Process.Start(new ProcessStartInfo(endpoint) { UseShellExecute = true });
            }
            catch (Exception error)
            {
                Notify(Strings.DashboardFailedPrefix, error.Message, ToolTipIcon.Warning);
            }
        }

        private void OpenLog()
        {
            string log = Path.Combine(_agent.StateDirectory, "agent.log");
            if (!File.Exists(log))
            {
                Notify(Strings.NoLogTitle, Strings.NoLogText, ToolTipIcon.Info);
                return;
            }
            try
            {
                Process.Start(new ProcessStartInfo("notepad.exe", "\"" + log + "\"") { UseShellExecute = true });
            }
            catch
            {
            }
        }

        private void OpenSettings()
        {
            using (SettingsForm form = new SettingsForm(_agent))
            {
                form.ShowDialog();
            }
            Refresh();
        }

        private void Quit()
        {
            int pending = _snapshot == null ? 0 : _snapshot.PendingBatches;
            using (ExitDialog dialog = new ExitDialog(pending))
            {
                dialog.ShowDialog();
                if (dialog.Choice == ExitChoice.Cancel)
                {
                    return;
                }
                if (dialog.Choice == ExitChoice.StopAgent)
                {
                    _agent.Run(new string[] { "stop", "--state", _agent.StateDirectory });
                }
            }
            Shutdown();
        }

        private void Shutdown()
        {
            _timer.Stop();
            _animationTimer.Stop();
            if (_popup != null && !_popup.IsDisposed) _popup.Close();
            _icon.Visible = false;
            _icon.Dispose();
            ExitThread();
        }

        private void Notify(string title, string text, ToolTipIcon icon)
        {
            try
            {
                _icon.ShowBalloonTip(5000, title, text, icon);
            }
            catch
            {
            }
        }

        private static string Describe(CliResult result)
        {
            if (result.TimedOut)
            {
                return Strings.CommandTimeout;
            }
            if (result.Error != null)
            {
                return result.Error;
            }
            string text = (result.StdErr ?? string.Empty).Trim();
            if (text.Length == 0)
            {
                text = (result.StdOut ?? string.Empty).Trim();
            }
            if (text.Length > 120)
            {
                text = text.Substring(0, 120);
            }
            return text.Length == 0 ? Strings.ExitCodePrefix + result.ExitCode : text;
        }

        private void StartPipeServer()
        {
            string name = Pipe.NameFor(_agent.StateDirectory);
            Thread thread = new Thread(delegate()
            {
                while (true)
                {
                    try
                    {
                        using (NamedPipeServerStream server = new NamedPipeServerStream(name, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.None))
                        {
                            server.WaitForConnection();
                            using (StreamReader reader = new StreamReader(server, Encoding.UTF8))
                            {
                                string line = reader.ReadLine();
                                if (line != null && line.Trim() == "show")
                                {
                                    Post(ShowPopup);
                                }
                            }
                        }
                    }
                    catch
                    {
                        Thread.Sleep(250);
                    }
                }
            });
            thread.IsBackground = true;
            thread.Start();
        }

        private static long NowMs()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        protected override void ExitThreadCore()
        {
            try
            {
                ThemeManager.Changed -= OnThemeChanged;
                Locale.Changed -= OnLocaleChanged;
                _timer.Stop();
                _timer.Dispose();
                _animationTimer.Stop();
                _animationTimer.Dispose();
                _icon.Visible = false;
                _icon.Dispose();
            }
            catch
            {
            }
            base.ExitThreadCore();
        }
    }
}
