using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace InceptSync
{
    internal enum ExitChoice
    {
        Cancel,
        TrayOnly,
        StopAgent
    }

    // "Exit tray" and "stop agent" are different intentions. Asking here keeps
    // the user from silently killing the outbox uploader.
    internal sealed class ExitDialog : LayeredCard
    {
        private sealed class Zone
        {
            public RectangleF Bounds;
            public bool Danger;
            public bool Primary;
            public string Label;
            public ExitChoice Choice;
        }

        private const float WidthUnits = 440f;
        private const float HeightUnits = 210f;

        private readonly Palette _palette = Palette.Current();
        private readonly List<Zone> _zones = new List<Zone>();
        private Font _titleFont;
        private Font _bodyFont;
        private int _hover = -1;
        private RectangleF _messageRect;
        private string _message;

        public ExitChoice Choice = ExitChoice.Cancel;

        public ExitDialog(int pendingBatches)
        {
            Text = Strings.ExitWindow;
            StartPosition = FormStartPosition.CenterScreen;
            Width = (int)Math.Round(WidthUnits * S);
            Height = (int)Math.Round(HeightUnits * S);
            _message = pendingBatches > 0
                ? string.Format(Strings.ExitPending, pendingBatches)
                : Strings.ExitPrompt;
            _titleFont = new Font("Segoe UI Semibold", 16f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _bodyFont = new Font("Segoe UI", 13f * S, FontStyle.Regular, GraphicsUnit.Pixel);
            _messageRect = new RectangleF(24f * S, 58f * S, 392f * S, 56f * S);
            _zones.Add(new Zone { Label = Strings.ExitTrayOnly, Bounds = new RectangleF(24f * S, 150f * S, 108f * S, 36f * S), Choice = ExitChoice.TrayOnly });
            _zones.Add(new Zone { Label = Strings.ExitStopAgent, Bounds = new RectangleF(142f * S, 150f * S, 188f * S, 36f * S), Danger = true, Choice = ExitChoice.StopAgent });
            _zones.Add(new Zone { Label = Strings.ExitCancel, Bounds = new RectangleF(340f * S, 150f * S, 76f * S, 36f * S), Primary = false, Choice = ExitChoice.Cancel });
        }

        protected override void DrawSurface(Graphics graphics, Size size)
        {
            CardGraphics.DrawCard(graphics, new RectangleF(0, 0, Width, Height), _palette, 16f * S);
            CardGraphics.DrawText(graphics, Strings.ExitTitle, _titleFont, new RectangleF(24f * S, 18f * S, 320f * S, 26f * S), _palette.Text, TextFormatFlags.EndEllipsis);
            CardGraphics.DrawText(graphics, _message, _bodyFont, _messageRect, _palette.Muted, TextFormatFlags.WordBreak);
            for (int index = 0; index < _zones.Count; index++)
            {
                Zone zone = _zones[index];
                if (zone.Choice == ExitChoice.Cancel)
                    CardGraphics.DrawNeutralButton(graphics, zone.Bounds, _palette, zone.Label, _bodyFont, index == _hover, S);
                else
                    CardGraphics.DrawButton(graphics, zone.Bounds, _palette, zone.Label, _bodyFont, zone.Primary, zone.Danger, index == _hover, S);
            }
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
            return point.Y < 50f * S;
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
            Choice = _zones[index].Choice;
            Close();
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

        protected override bool ProcessCmdKey(ref Message message, Keys keyData)
        {
            if (keyData == Keys.Escape)
            {
                Choice = ExitChoice.Cancel;
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
            }
            base.Dispose(disposing);
        }
    }
}
