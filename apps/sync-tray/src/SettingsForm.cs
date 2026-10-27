using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace InceptSync
{
    internal sealed class SettingsForm : LayeredCard
    {
        private enum LabelKind
        {
            None,
            Close,
            EditSources,
            OpenFolder,
            RestartAgent,
            Done,
            Light,
            Dark,
            System,
            Chinese,
            English
        }

        private sealed class Zone
        {
            public RectangleF Bounds;
            public LabelKind Label;
            public Action Handler;
            public bool Primary;
            public bool Glyph;
            public bool Checkbox;
            public ThemeMode? Theme;
            public Language? Lang;
        }

        private const float WidthUnits = 540f;
        private const float HeightUnits = 500f;

        private readonly AgentClient _agent;
        private readonly Palette _palette = Palette.Current();
        private readonly List<Zone> _zones = new List<Zone>();
        private readonly List<Zone> _appearance = new List<Zone>();
        private readonly List<Zone> _languages = new List<Zone>();
        private string[] _sources;
        private readonly string _deviceId;
        private readonly string _endpoint;
        private readonly string _stateDirectory;
        private readonly string _interval;
        private Font _titleFont;
        private Font _bodyFont;
        private Font _tinyFont;
        private Font _glyphFont;
        private int _hover = -1;
        private bool _autoStart;
        private bool _busy;
        private string _message;
        private bool _messageIsError;

        public SettingsForm(AgentClient agent)
        {
            _agent = agent;
            Text = Strings.SettingsTitle;
            _deviceId = agent.DeviceId();
            _endpoint = agent.Endpoint();
            _stateDirectory = agent.StateDirectory;
            StatusSnapshot snapshot = StatusSnapshot.Load(agent.StateDirectory);
            _interval = (snapshot ?? new StatusSnapshot()).IntervalText() + Strings.IntervalSuffix;
            _sources = agent.AllowedSources().ToArray();
            StartPosition = FormStartPosition.CenterScreen;
            Width = (int)Math.Round(WidthUnits * S);
            Height = (int)Math.Round(HeightUnits * S);
            _titleFont = new Font("Segoe UI Semibold", 16f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _bodyFont = new Font("Segoe UI", 13f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _tinyFont = new Font("Segoe UI", 11.5f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _glyphFont = new Font("Segoe MDL2 Assets", 12f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _autoStart = AgentClient.IsAutoStartEnabled();

            _zones.Add(new Zone { Bounds = new RectangleF((WidthUnits - 50f) * S, 14f * S, 32f * S, 32f * S), Label = LabelKind.Close, Glyph = true, Handler = delegate { Close(); } });
            _zones.Add(new Zone { Bounds = new RectangleF(26f * S, 278f * S, 150f * S, 34f * S), Label = LabelKind.EditSources, Handler = OpenSources });
            _zones.Add(new Zone { Bounds = new RectangleF(186f * S, 278f * S, 150f * S, 34f * S), Label = LabelKind.OpenFolder, Handler = OpenStateDirectory });
            _zones.Add(new Zone { Bounds = new RectangleF(346f * S, 278f * S, 150f * S, 34f * S), Label = LabelKind.RestartAgent, Handler = RestartAgent });
            _zones.Add(new Zone { Bounds = new RectangleF(20f * S, 318f * S, 490f * S, 30f * S), Checkbox = true, Handler = ToggleAutoStart });

            AddOption(_appearance, 194f, 360f, 88f, LabelKind.Light, ThemeMode.Light, null);
            AddOption(_appearance, 290f, 360f, 88f, LabelKind.Dark, ThemeMode.Dark, null);
            AddOption(_appearance, 386f, 360f, 108f, LabelKind.System, ThemeMode.System, null);
            AddOption(_languages, 194f, 402f, 88f, LabelKind.Chinese, null, Language.Zh);
            AddOption(_languages, 290f, 402f, 96f, LabelKind.English, null, Language.En);

            _zones.Add(new Zone { Bounds = new RectangleF(418f * S, 430f * S, 96f * S, 36f * S), Label = LabelKind.Done, Primary = true, Handler = delegate { Close(); } });

            Locale.Changed += OnLocaleChanged;
        }

        private void AddOption(List<Zone> group, float x, float y, float width, LabelKind label, ThemeMode? theme, Language? language)
        {
            Zone zone = new Zone { Bounds = new RectangleF(x * S, y * S, width * S, 32f * S), Label = label, Theme = theme, Lang = language };
            if (theme.HasValue)
            {
                ThemeMode mode = theme.Value;
                zone.Handler = delegate { SetTheme(mode); };
            }
            else
            {
                Language value = language.Value;
                zone.Handler = delegate { SetLanguage(value); };
            }
            group.Add(zone);
            _zones.Add(zone);
        }

        private void OnLocaleChanged(object sender, EventArgs e)
        {
            if (IsDisposed) return;
            Text = Strings.SettingsTitle;
            Render();
        }

        // The Owner edits sources in a browser; refresh when the dialog regains
        // focus so the list reflects what the dashboard just saved.
        protected override void OnActivated(EventArgs e)
        {
            base.OnActivated(e);
            string[] next = _agent.AllowedSources().ToArray();
            if (string.Join(",", next) != string.Join(",", _sources))
            {
                _sources = next;
                Render();
            }
        }

        private static string LabelText(LabelKind kind)
        {
            switch (kind)
            {
                case LabelKind.EditSources: return Strings.EditSources;
                case LabelKind.OpenFolder: return Strings.OpenFolder;
                case LabelKind.RestartAgent: return Strings.RestartAgent;
                case LabelKind.Done: return Strings.Done;
                case LabelKind.Light: return Strings.Light;
                case LabelKind.Dark: return Strings.Dark;
                case LabelKind.System: return Strings.FollowSystem;
                case LabelKind.Chinese: return "中文";
                case LabelKind.English: return "English";
            }
            return string.Empty;
        }

        protected override void DrawSurface(Graphics graphics, Size size)
        {
            CardGraphics.DrawCard(graphics, new RectangleF(0, 0, Width, Height), _palette, 16f * S);
            CardGraphics.DrawText(graphics, Strings.SettingsTitle, _titleFont, new RectangleF(26f * S, 18f * S, 240f * S, 26f * S), _palette.Text, TextFormatFlags.EndEllipsis);

            Zone close = _zones[0];
            TextFormatFlags centered = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter;
            CardGraphics.DrawText(graphics, "\uE711", _glyphFont, close.Bounds, _hover == 0 ? _palette.Text : _palette.Muted, centered);

            using (Pen separator = new Pen(_palette.Separator))
            {
                graphics.DrawLine(separator, 26f * S, 56f * S, (WidthUnits - 26f) * S, 56f * S);
            }

            DrawRow(graphics, Strings.DeviceId, _deviceId, 0);
            DrawRow(graphics, Strings.Endpoint, _endpoint, 1);
            DrawRow(graphics, Strings.StateDirectory, _stateDirectory, 2);
            DrawRow(graphics, Strings.SyncInterval, _interval, 3);

            CardGraphics.DrawText(graphics, Strings.SourcesLabel, _bodyFont,
                new RectangleF(26f * S, 204f * S, 116f * S, 24f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            CardGraphics.DrawText(graphics, SourcesText(), _bodyFont,
                new RectangleF(148f * S, 200f * S, 366f * S, 44f * S), _palette.Text, TextFormatFlags.WordBreak);

            CardGraphics.DrawText(graphics, Strings.BindingHint, _tinyFont,
                new RectangleF(26f * S, 246f * S, 488f * S, 28f * S), _palette.Muted, TextFormatFlags.WordBreak);

            foreach (Zone zone in _zones)
            {
                if (zone.Glyph || zone.Checkbox || zone.Theme.HasValue || zone.Lang.HasValue) continue;
                if (zone.Label == LabelKind.OpenFolder)
                {
                    CardGraphics.DrawNeutralButton(graphics, zone.Bounds, _palette, LabelText(zone.Label), _bodyFont, _hover == _zones.IndexOf(zone), S);
                    continue;
                }
                CardGraphics.DrawButton(graphics, zone.Bounds, _palette, LabelText(zone.Label), _bodyFont,
                    zone.Primary, false, _hover == _zones.IndexOf(zone), S);
            }

            DrawCheckbox(graphics);

            CardGraphics.DrawText(graphics, Strings.Appearance, _bodyFont,
                new RectangleF(26f * S, 360f * S, 120f * S, 32f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            foreach (Zone zone in _appearance)
            {
                CardGraphics.DrawThemeOption(graphics, zone.Bounds, _palette, LabelText(zone.Label), _bodyFont,
                    zone.Theme == ThemeManager.Mode, _hover == _zones.IndexOf(zone));
            }

            CardGraphics.DrawText(graphics, Strings.LanguageLabel, _bodyFont,
                new RectangleF(26f * S, 402f * S, 120f * S, 32f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            foreach (Zone zone in _languages)
            {
                CardGraphics.DrawThemeOption(graphics, zone.Bounds, _palette, LabelText(zone.Label), _bodyFont,
                    zone.Lang == Locale.Current, _hover == _zones.IndexOf(zone));
            }

            if (!string.IsNullOrEmpty(_message))
            {
                Color color = _messageIsError ? _palette.StateColor(AgentVisualState.Attention) : _palette.Muted;
                CardGraphics.DrawText(graphics, _message, _tinyFont,
                    new RectangleF(26f * S, 440f * S, 380f * S, 20f * S), color, TextFormatFlags.EndEllipsis);
            }
        }

        private void DrawRow(Graphics graphics, string label, string value, int index)
        {
            float y = (72f + index * 33f) * S;
            CardGraphics.DrawText(graphics, label, _bodyFont, new RectangleF(26f * S, y, 116f * S, 24f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            CardGraphics.DrawText(graphics, value, _bodyFont, new RectangleF(148f * S, y, 366f * S, 24f * S), _palette.Text, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        private string SourcesText()
        {
            if (_sources == null || _sources.Length == 0)
            {
                return Strings.SourcesUnknown;
            }
            return string.Join(", ", _sources);
        }

        private void DrawCheckbox(Graphics graphics)
        {
            RectangleF box = new RectangleF(26f * S, 324f * S, 18f * S, 18f * S);
            using (System.Drawing.Drawing2D.GraphicsPath path = CardGraphics.Rounded(box, 5f * S))
            {
                if (_autoStart)
                {
                    using (SolidBrush brush = new SolidBrush(_palette.Primary))
                    {
                        graphics.FillPath(brush, path);
                    }
                }
                using (Pen pen = new Pen(_autoStart ? _palette.Primary : _palette.Border))
                {
                    graphics.DrawPath(pen, path);
                }
            }
            if (_autoStart)
            {
                CardGraphics.DrawText(graphics, "\uE73E", _glyphFont,
                    new RectangleF(box.X, box.Y, box.Width, box.Height), _palette.PrimaryText,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
            CardGraphics.DrawText(graphics, Strings.AutoStart, _bodyFont,
                new RectangleF(54f * S, 318f * S, 440f * S, 30f * S), _palette.Text, TextFormatFlags.VerticalCenter);
        }

        protected override bool HitsCard(Point point)
        {
            using (System.Drawing.Drawing2D.GraphicsPath path = CardGraphics.Rounded(new RectangleF(0, 0, Width, Height), 16f * S))
            {
                return path.IsVisible(point);
            }
        }

        protected override bool Draggable(Point point)
        {
            return point.Y < 50f * S && !_zones[0].Bounds.Contains(point);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            int index = ZoneAt(e.Location);
            if (index != _hover)
            {
                _hover = index;
                Cursor = index >= 0 ? Cursors.Hand : Cursors.Default;
                Render();
            }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (e.Button != MouseButtons.Left)
            {
                return;
            }
            int index = ZoneAt(e.Location);
            if (index < 0)
            {
                return;
            }
            _zones[index].Handler();
        }

        private int ZoneAt(Point point)
        {
            for (int index = 0; index < _zones.Count; index++)
            {
                if (_zones[index].Bounds.Contains(point))
                {
                    return index;
                }
            }
            return -1;
        }

        private void ToggleAutoStart()
        {
            try
            {
                AgentClient.SetAutoStart(!_autoStart, Application.ExecutablePath);
                _message = null;
            }
            catch (Exception failure)
            {
                _message = Strings.AutoStartFailedPrefix + failure.Message;
                _messageIsError = true;
            }
            finally
            {
                _autoStart = AgentClient.IsAutoStartEnabled();
            }
            Render();
        }

        private void SetTheme(ThemeMode mode)
        {
            try
            {
                ThemeManager.SetMode(mode);
                _message = null;
            }
            catch
            {
                _message = Strings.ThemeFailed;
                _messageIsError = true;
            }
            Render();
        }

        private void SetLanguage(Language language)
        {
            try
            {
                Locale.SetLanguage(language);
                _message = null;
            }
            catch
            {
                _message = Strings.LanguageFailed;
                _messageIsError = true;
            }
            Render();
        }

        // Sources are owned by the server: the device token may not widen its own
        // policy, so the tray opens the dashboard where the Owner can edit it.
        private void OpenSources()
        {
            string url = _agent.SettingsUrl(Locale.IsEnglish ? "en" : "zh");
            if (string.IsNullOrEmpty(url))
            {
                _message = Strings.NoEndpoint;
                _messageIsError = true;
                Render();
                return;
            }
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
                _message = null;
            }
            catch (Exception failure)
            {
                _message = Strings.BrowserFailedPrefix + failure.Message;
                _messageIsError = true;
            }
            Render();
        }

        private void OpenStateDirectory()
        {
            try
            {
                Process.Start("explorer.exe", "\"" + _agent.StateDirectory + "\"");
            }
            catch
            {
            }
        }

        // The Agent only refreshes its policy at startup, so a changed allowlist
        // needs a restart; keep the work off the UI thread.
        private void RestartAgent()
        {
            if (_busy)
            {
                return;
            }
            _busy = true;
            _message = Strings.Restarting;
            _messageIsError = false;
            Render();
            ThreadPool.QueueUserWorkItem(delegate
            {
                string error;
                bool timedOut;
                bool restarted = _agent.Restart(out error, out timedOut);
                Post(delegate
                {
                    _busy = false;
                    if (restarted)
                    {
                        _message = Strings.Restarted;
                        _messageIsError = false;
                    }
                    else
                    {
                        _message = RestartMessage(error, timedOut);
                        _messageIsError = true;
                    }
                    Render();
                });
            });
        }

        private static string RestartMessage(string error, bool timedOut)
        {
            // The common failure here is an Agent started from an elevated shell:
            // its instance pipe is invisible to this process.
            if (error == "AGENT_UNREACHABLE")
            {
                return Strings.AgentElevated;
            }
            if (timedOut)
            {
                return Strings.RestartTimeout;
            }
            return Strings.RestartFailedPrefix + error;
        }

        private void Post(Action action)
        {
            if (IsDisposed || !IsHandleCreated)
            {
                return;
            }
            try
            {
                BeginInvoke(action);
            }
            catch
            {
            }
        }

        protected override bool ProcessCmdKey(ref Message message, Keys keyData)
        {
            if (keyData == Keys.Escape)
            {
                Close();
                return true;
            }
            return base.ProcessCmdKey(ref message, keyData);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                Locale.Changed -= OnLocaleChanged;
                if (_titleFont != null) _titleFont.Dispose();
                if (_bodyFont != null) _bodyFont.Dispose();
                if (_tinyFont != null) _tinyFont.Dispose();
                if (_glyphFont != null) _glyphFont.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
