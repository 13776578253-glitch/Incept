using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace InceptSync
{
    // Borderless card shown next to the tray icon. Everything is drawn on a
    // layered surface so the rounded corners stay smooth at any DPI.
    internal sealed class StatusPopup : LayeredCard
    {
        private sealed class Row
        {
            public string Label;
            public string Glyph;
            public Action Handler;
            public RectangleF Bounds;
            public bool Exit;
        }

        private const float WidthUnits = 360f;
        private const float HeightUnits = 430f;
        private const float Pad = 20f;

        private StatusSnapshot _snapshot;
        private int _animationFrame;
        private readonly Palette _palette = Palette.Current();
        private readonly List<Row> _rows = new List<Row>();
        private Font _titleFont;
        private Font _bodyFont;
        private Font _smallFont;
        private Font _glyphFont;
        private int _hover = -1;
        private bool _closing;
        private RectangleF _iconRect;
        private RectangleF _titleRect;
        private RectangleF _statusRect;
        private RectangleF _separator;
        private RectangleF _exitSeparator;

        public Action SyncRequested;
        public Action DashboardRequested;
        public Action PauseRequested;
        public Action SettingsRequested;
        public Action LogRequested;
        public Action QuitRequested;

        public StatusPopup(AgentClient agent, StatusSnapshot snapshot)
        {
            Text = Strings.StatusTitle;
            _snapshot = snapshot ?? new StatusSnapshot();
            Width = (int)Math.Round(WidthUnits * S);
            Height = (int)Math.Round(HeightUnits * S);
            CreateFonts();
            BuildRows();
            LayoutSurface();
            Locale.Changed += OnLocaleChanged;
        }

        private void CreateFonts()
        {
            _titleFont = CreateFont("Segoe UI Semibold", 17f);
            _bodyFont = CreateFont("Segoe UI", 13f);
            _smallFont = CreateFont("Segoe UI", 12.5f);
            _glyphFont = CreateFont("Segoe MDL2 Assets", 15f);
        }

        private Font CreateFont(string family, float size)
        {
            try
            {
                return new Font(family, size * S, FontStyle.Regular, GraphicsUnit.Pixel);
            }
            catch
            {
                return new Font("Segoe UI", size * S, FontStyle.Regular, GraphicsUnit.Pixel);
            }
        }

        private void BuildRows()
        {
            _rows.Add(new Row { Label = Strings.SyncNow, Glyph = "\uE895", Handler = delegate { if (SyncRequested != null) SyncRequested(); } });
            _rows.Add(new Row { Label = Strings.OpenDashboard, Glyph = "\uE774", Handler = delegate { if (DashboardRequested != null) DashboardRequested(); } });
            _rows.Add(new Row { Label = _snapshot.Paused ? Strings.ResumeSync : Strings.PauseSync, Glyph = _snapshot.Paused ? "\uE768" : "\uE769", Handler = delegate { if (PauseRequested != null) PauseRequested(); } });
            _rows.Add(new Row { Label = Strings.ViewLog, Glyph = "\uE7C3", Handler = delegate { if (LogRequested != null) LogRequested(); } });
            _rows.Add(new Row { Label = Strings.Settings, Glyph = "\uE713", Handler = delegate { if (SettingsRequested != null) SettingsRequested(); } });
            _rows.Add(new Row { Label = Strings.QuitApp, Glyph = "\uE7E8", Handler = delegate { if (QuitRequested != null) QuitRequested(); }, Exit = true });
        }

        private void OnLocaleChanged(object sender, EventArgs e)
        {
            if (IsDisposed) return;
            Text = Strings.StatusTitle;
            _rows.Clear();
            BuildRows();
            LayoutSurface();
            Render();
        }

        private void LayoutSurface()
        {
            _iconRect = new RectangleF(Pad * S, 18f * S, 40f * S, 40f * S);
            _titleRect = new RectangleF(72f * S, 14f * S, 268f * S, 24f * S);
            _statusRect = new RectangleF(86f * S, 42f * S, 250f * S, 22f * S);

            float y = 182f * S;
            foreach (Row row in _rows)
            {
                if (row.Exit)
                {
                    y += 8f * S;
                }
                row.Bounds = new RectangleF(12f * S, y, (WidthUnits - 24f) * S, 34f * S);
                y += 38f * S;
            }
            _separator = new RectangleF(Pad * S, 170f * S, (WidthUnits - Pad * 2) * S, 1f);
            _exitSeparator = new RectangleF(Pad * S, _rows[_rows.Count - 1].Bounds.Top - 8f * S, (WidthUnits - Pad * 2) * S, 1f);
        }

        protected override void DrawSurface(Graphics graphics, Size size)
        {
            CardGraphics.DrawCard(graphics, new RectangleF(0, 0, Width, Height), _palette, 16f * S);

            AgentVisualState state = _snapshot.VisualState(NowMs());
            IconFactory.Draw(graphics, _iconRect, state, _palette.Dark, _animationFrame);

            CardGraphics.DrawText(graphics, "Incept Sync Agent", _titleFont, _titleRect, _palette.Text, TextFormatFlags.EndEllipsis);

            using (SolidBrush dot = new SolidBrush(_palette.StateColor(state)))
            {
                graphics.FillEllipse(dot, 72f * S, 50f * S, 7f * S, 7f * S);
            }
            CardGraphics.DrawText(graphics, StateText(state), _smallFont, _statusRect, _palette.Muted, TextFormatFlags.EndEllipsis);

            DrawInfo(graphics, Strings.LastSync, _snapshot.LastSyncText(), _palette.Text, 0);
            DrawInfo(graphics, Strings.Interval, _snapshot.IntervalText(), _palette.Text, 1);
            if (state == AgentVisualState.Attention && !string.IsNullOrEmpty(_snapshot.LastErrorCode))
            {
                DrawInfo(graphics, Strings.LastError, _snapshot.LastErrorCode, _palette.StateColor(AgentVisualState.Attention), 2);
            }
            else
            {
                DrawInfo(graphics, Strings.Pending, _snapshot.PendingText(), _palette.Text, 2);
            }

            using (Pen separator = new Pen(_palette.Separator))
            {
                graphics.DrawLine(separator, _separator.X, _separator.Y, _separator.Right, _separator.Y);
                graphics.DrawLine(separator, _exitSeparator.X, _exitSeparator.Y, _exitSeparator.Right, _exitSeparator.Y);
            }

            for (int index = 0; index < _rows.Count; index++)
            {
                Row row = _rows[index];
                if (index == _hover)
                {
                    using (System.Drawing.Drawing2D.GraphicsPath hover = CardGraphics.Rounded(row.Bounds, 9f * S))
                    using (SolidBrush brush = new SolidBrush(_palette.Hover))
                    {
                        graphics.FillPath(brush, hover);
                    }
                }
                Color foreground = _palette.Text;
                CardGraphics.DrawText(graphics, row.Glyph, _glyphFont,
                    new RectangleF(24f * S, row.Bounds.Y, 20f * S, row.Bounds.Height), foreground,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                CardGraphics.DrawText(graphics, row.Label, _bodyFont,
                    new RectangleF(54f * S, row.Bounds.Y, 280f * S, row.Bounds.Height), foreground,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }
        }

        private void DrawInfo(Graphics graphics, string label, string value, Color valueColor, int index)
        {
            float y = 78f * S + index * 28f * S;
            CardGraphics.DrawText(graphics, label, _bodyFont,
                new RectangleF(Pad * S, y, 140f * S, 24f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            CardGraphics.DrawText(graphics, value, _bodyFont,
                new RectangleF(140f * S, y, (WidthUnits - Pad * 2 - 120f) * S, 24f * S), valueColor,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Right | TextFormatFlags.EndEllipsis);
        }

        private string StateText(AgentVisualState state)
        {
            switch (state)
            {
                case AgentVisualState.Connected: return _snapshot.Activity == "collecting" ? Strings.StateCollecting : Strings.StateIdle;
                case AgentVisualState.Syncing: return Strings.StateUploading;
                case AgentVisualState.Paused: return Strings.StatePaused;
                case AgentVisualState.Attention: return Strings.StateAttention + (_snapshot.LastErrorCode ?? Strings.UnknownError);
                default: return Strings.StateOffline;
            }
        }

        protected override bool HitsCard(Point point)
        {
            using (System.Drawing.Drawing2D.GraphicsPath path = CardGraphics.Rounded(new RectangleF(0, 0, Width, Height), 16f * S))
            {
                return path.IsVisible(point);
            }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            int index = RowAt(e.Location);
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
            int index = RowAt(e.Location);
            if (index < 0)
            {
                return;
            }
            Row row = _rows[index];
            _closing = true;
            Close();
            if (row.Handler != null)
            {
                row.Handler();
            }
        }

        private int RowAt(Point point)
        {
            for (int index = 0; index < _rows.Count; index++)
            {
                if (_rows[index].Bounds.Contains(point))
                {
                    return index;
                }
            }
            return -1;
        }

        public void UpdateSnapshot(StatusSnapshot snapshot, int animationFrame)
        {
            if (IsDisposed) return;
            _snapshot = snapshot ?? new StatusSnapshot();
            _animationFrame = animationFrame;
            _rows[2].Label = _snapshot.Paused ? Strings.ResumeSync : Strings.PauseSync;
            _rows[2].Glyph = _snapshot.Paused ? "\uE768" : "\uE769";
            Render();
        }

        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            // Desktop automation briefly activates its capture helper. Keep the
            // test surface available until an explicit action or Escape closes it.
            if (!_closing && Environment.GetEnvironmentVariable("INCEPT_TRAY_UI_TEST") != "1")
            {
                Close();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _closing = true;
            base.OnFormClosing(e);
        }

        protected override bool ProcessCmdKey(ref Message message, Keys keyData)
        {
            if (keyData == Keys.Escape)
            {
                _closing = true;
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
                if (_smallFont != null) _smallFont.Dispose();
                if (_glyphFont != null) _glyphFont.Dispose();
            }
            base.Dispose(disposing);
        }

        private static long NowMs()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        public void ShowAnchored(NotifyIcon icon)
        {
            Location = TrayPlacement.LocationFor(icon, Size, (int)Math.Round(8f * S));
            ShowCard();
        }
    }
}
