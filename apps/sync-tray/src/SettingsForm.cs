using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace InceptSync
{
    internal sealed class SettingsForm : LayeredCard
    {
        private sealed class Zone
        {
            public RectangleF Bounds;
            public string Label;
            public Action Handler;
            public bool Primary;
            public bool Checkbox;
            public ThemeMode? Theme;
        }

        private const float WidthUnits = 520f;
        private const float HeightUnits = 430f;

        private readonly AgentClient _agent;
        private readonly Palette _palette = Palette.Current();
        private readonly List<Zone> _zones = new List<Zone>();
        private readonly List<KeyValuePair<string, string>> _rows = new List<KeyValuePair<string, string>>();
        private Font _titleFont;
        private Font _bodyFont;
        private Font _tinyFont;
        private Font _glyphFont;
        private int _hover = -1;
        private bool _autoStart;
        private string _error;

        public SettingsForm(AgentClient agent)
        {
            Text = "Incept Sync · 设置";
            _agent = agent;
            StartPosition = FormStartPosition.CenterScreen;
            Width = (int)Math.Round(WidthUnits * S);
            Height = (int)Math.Round(HeightUnits * S);
            _titleFont = new Font("Segoe UI Semibold", 16f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _bodyFont = new Font("Segoe UI", 13f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _tinyFont = new Font("Segoe UI", 11.5f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _glyphFont = new Font("Segoe MDL2 Assets", 12f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _autoStart = AgentClient.IsAutoStartEnabled();

            _rows.Add(new KeyValuePair<string, string>("设备 ID", agent.DeviceId()));
            _rows.Add(new KeyValuePair<string, string>("服务端点", agent.Endpoint()));
            _rows.Add(new KeyValuePair<string, string>("状态目录", agent.StateDirectory));
            StatusSnapshot snapshot = StatusSnapshot.Load(agent.StateDirectory);
            _rows.Add(new KeyValuePair<string, string>("同步间隔", (snapshot ?? new StatusSnapshot()).IntervalText() + "（由 Agent 控制）"));

            _zones.Add(new Zone { Bounds = new RectangleF((WidthUnits - 50f) * S, 14f * S, 32f * S, 32f * S), Handler = delegate { Close(); } });
            _zones.Add(new Zone { Bounds = new RectangleF(20f * S, 262f * S, 480f * S, 30f * S), Checkbox = true, Handler = ToggleAutoStart });
            _zones.Add(new Zone { Bounds = new RectangleF(26f * S, 366f * S, 140f * S, 36f * S), Label = "打开状态目录", Handler = OpenStateDirectory });
            _zones.Add(new Zone { Bounds = new RectangleF(398f * S, 366f * S, 96f * S, 36f * S), Label = "完成", Primary = true, Handler = delegate { Close(); } });
            _zones.Add(new Zone { Bounds = new RectangleF(194f * S, 306f * S, 88f * S, 32f * S), Label = "浅色", Theme = ThemeMode.Light, Handler = delegate { SetTheme(ThemeMode.Light); } });
            _zones.Add(new Zone { Bounds = new RectangleF(290f * S, 306f * S, 88f * S, 32f * S), Label = "深色", Theme = ThemeMode.Dark, Handler = delegate { SetTheme(ThemeMode.Dark); } });
            _zones.Add(new Zone { Bounds = new RectangleF(386f * S, 306f * S, 108f * S, 32f * S), Label = "跟随系统", Theme = ThemeMode.System, Handler = delegate { SetTheme(ThemeMode.System); } });
        }

        protected override void DrawSurface(Graphics graphics, Size size)
        {
            CardGraphics.DrawCard(graphics, new RectangleF(0, 0, Width, Height), _palette, 16f * S);
            CardGraphics.DrawText(graphics, "设置", _titleFont, new RectangleF(26f * S, 18f * S, 200f * S, 26f * S), _palette.Text, TextFormatFlags.EndEllipsis);

            bool closeHover = _hover == 0;
            if (closeHover)
            {
                using (System.Drawing.Drawing2D.GraphicsPath path = CardGraphics.Rounded(_zones[0].Bounds, 8f * S))
                using (SolidBrush brush = new SolidBrush(_palette.Hover))
                {
                    graphics.FillPath(brush, path);
                }
            }
            CardGraphics.DrawText(graphics, "\uE711", _glyphFont,
                new RectangleF(_zones[0].Bounds.X, _zones[0].Bounds.Y, _zones[0].Bounds.Width, _zones[0].Bounds.Height),
                closeHover ? _palette.Text : _palette.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

            using (Pen separator = new Pen(_palette.Separator))
            {
                graphics.DrawLine(separator, 26f * S, 56f * S, (WidthUnits - 26f) * S, 56f * S);
            }

            for (int index = 0; index < _rows.Count; index++)
            {
                float y = (72f + index * 34f) * S;
                CardGraphics.DrawText(graphics, _rows[index].Key, _bodyFont, new RectangleF(26f * S, y, 96f * S, 24f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
                CardGraphics.DrawText(graphics, _rows[index].Value, _bodyFont, new RectangleF(128f * S, y, 366f * S, 24f * S), _palette.Text, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            }

            CardGraphics.DrawText(graphics, "设备信息来自绑定配置。更换设备或服务端点时，请重新绑定。", _tinyFont,
                new RectangleF(26f * S, 214f * S, 468f * S, 40f * S), _palette.Muted, TextFormatFlags.WordBreak);

            DrawCheckbox(graphics);
            CardGraphics.DrawText(graphics, "外观", _bodyFont,
                new RectangleF(26f * S, 306f * S, 96f * S, 32f * S), _palette.Muted, TextFormatFlags.VerticalCenter);
            for (int index = 4; index < _zones.Count; index++)
            {
                Zone zone = _zones[index];
                CardGraphics.DrawThemeOption(graphics, zone.Bounds, _palette, zone.Label, _bodyFont,
                    zone.Theme == ThemeManager.Mode, _hover == index);
            }

            bool openHover = _hover == 2;
            bool doneHover = _hover == 3;
            CardGraphics.DrawButton(graphics, _zones[2].Bounds, _palette, _zones[2].Label, _bodyFont, false, false, openHover, S);
            CardGraphics.DrawButton(graphics, _zones[3].Bounds, _palette, _zones[3].Label, _bodyFont, true, false, doneHover, S);

            if (_error != null)
            {
                CardGraphics.DrawText(graphics, _error, _tinyFont, new RectangleF(26f * S, 342f * S, 468f * S, 18f * S), _palette.StateColor(AgentVisualState.Attention), TextFormatFlags.EndEllipsis);
            }
        }

        private void DrawCheckbox(Graphics graphics)
        {
            RectangleF box = new RectangleF(26f * S, 268f * S, 18f * S, 18f * S);
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
            CardGraphics.DrawText(graphics, "登录 Windows 时启动托盘（当前用户）", _bodyFont,
                new RectangleF(54f * S, 262f * S, 440f * S, 30f * S), _palette.Text, TextFormatFlags.VerticalCenter);
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
                _autoStart = !_autoStart;
                _error = null;
            }
            catch (Exception failure)
            {
                _error = "无法更新登录启动项：" + failure.Message;
            }
            Render();
        }

        private void SetTheme(ThemeMode mode)
        {
            try
            {
                ThemeManager.SetMode(mode);
                _error = null;
            }
            catch { _error = "无法保存外观设置，请检查状态目录是否可写。"; }
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
                if (_titleFont != null) _titleFont.Dispose();
                if (_bodyFont != null) _bodyFont.Dispose();
                if (_tinyFont != null) _tinyFont.Dispose();
                if (_glyphFont != null) _glyphFont.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
