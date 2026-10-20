using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace InceptSync
{
    // Base for every surface the tray draws (popup, exit dialog, settings).
    // A layered window with a 32bpp premultiplied bitmap gives real
    // anti-aliased corners instead of the jagged window Region used before.
    internal abstract class LayeredCard : Form
    {
        protected readonly float S;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SIZE
        {
            public int CX;
            public int CY;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        private struct BLENDFUNCTION
        {
            public byte BlendOp;
            public byte BlendFlags;
            public byte SourceConstantAlpha;
            public byte AlphaFormat;
        }

        [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr handle);
        [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr handle, IntPtr dc);
        [DllImport("user32.dll")] private static extern bool UpdateLayeredWindow(IntPtr handle, IntPtr dstDc, ref POINT dst, ref SIZE size, IntPtr srcDc, ref POINT src, int colorKey, ref BLENDFUNCTION blend, int flags);
        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr handle);
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr wParam, IntPtr lParam);
        [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);

        private bool _surfaceReady;

        protected LayeredCard()
        {
            Text = "Incept Sync";
            // Match the compact density of the Docker Desktop tray menu.
            S = Dpi.Scale() * 0.84f;
            FormBorderStyle = FormBorderStyle.None;
            // Expose the same self-drawn surfaces to desktop automation when
            // explicitly testing; production cards remain tray-only windows.
            ShowInTaskbar = Environment.GetEnvironmentVariable("INCEPT_TRAY_UI_TEST") == "1";
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            KeyPreview = true;
            BackColor = Color.Black;
            DoubleBuffered = false;
            SetStyle(ControlStyles.Opaque, true);
            ThemeManager.Changed += OnThemeChanged;
        }

        private void OnThemeChanged(object sender, EventArgs e)
        {
            if (IsDisposed) return;
            Palette.Current();
            Render();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) ThemeManager.Changed -= OnThemeChanged;
            base.Dispose(disposing);
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ExStyle |= 0x00080000; // WS_EX_LAYERED
                if (!ShowInTaskbar) parameters.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW
                return parameters;
            }
        }

        protected abstract void DrawSurface(Graphics graphics, Size size);

        protected abstract bool HitsCard(Point point);

        protected virtual bool Draggable(Point point)
        {
            return false;
        }

        protected void Render()
        {
            if (!_surfaceReady || Width <= 0 || Height <= 0)
            {
                return;
            }
            using (Bitmap bitmap = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb))
            {
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                    graphics.Clear(Color.Transparent);
                    DrawSurface(graphics, bitmap.Size);
                }
                ApplySurface(bitmap);
            }
        }

        private void ApplySurface(Bitmap bitmap)
        {
            IntPtr screenDc = GetDC(IntPtr.Zero);
            IntPtr memoryDc = CreateCompatibleDC(screenDc);
            IntPtr hBitmap = IntPtr.Zero;
            IntPtr previous = IntPtr.Zero;
            try
            {
                hBitmap = bitmap.GetHbitmap(Color.FromArgb(0));
                previous = SelectObject(memoryDc, hBitmap);
                SIZE size = new SIZE();
                size.CX = bitmap.Width;
                size.CY = bitmap.Height;
                POINT source = new POINT();
                POINT destination = new POINT();
                destination.X = Left;
                destination.Y = Top;
                BLENDFUNCTION blend = new BLENDFUNCTION();
                blend.BlendOp = 0;
                blend.SourceConstantAlpha = 255;
                blend.AlphaFormat = 1;
                UpdateLayeredWindow(Handle, screenDc, ref destination, ref size, memoryDc, ref source, 0, ref blend, 2);
            }
            finally
            {
                if (hBitmap != IntPtr.Zero)
                {
                    SelectObject(memoryDc, previous);
                    DeleteObject(hBitmap);
                }
                DeleteDC(memoryDc);
                ReleaseDC(IntPtr.Zero, screenDc);
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            _surfaceReady = true;
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Render();
            SetForegroundWindow(Handle);
            Activate();
        }

        protected override void OnLocationChanged(EventArgs e)
        {
            base.OnLocationChanged(e);
            if (_surfaceReady)
            {
                Render();
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left && Draggable(e.Location))
            {
                ReleaseCapture();
                SendMessage(Handle, 0x00A1, (IntPtr)2, IntPtr.Zero);
            }
        }

        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x001A || message.Msg == 0x031A) ThemeManager.RefreshSystem();
            if (message.Msg == 0x0021) // WM_MOUSEACTIVATE
            {
                message.Result = (IntPtr)1; // MA_ACTIVATE: deliver the first click.
                return;
            }
            if (message.Msg == 0x0084) // WM_NCHITTEST
            {
                int packed = message.LParam.ToInt32();
                Point screen = new Point((short)(packed & 0xFFFF), (short)((packed >> 16) & 0xFFFF));
                Point client = PointToClient(screen);
                if (!HitsCard(client))
                {
                    message.Result = (IntPtr)(-1); // HTTRANSPARENT: click passes through
                    return;
                }
                if (Draggable(client))
                {
                    message.Result = (IntPtr)2; // HTCAPTION: drag the dialog
                    return;
                }
                message.Result = (IntPtr)1; // HTCLIENT
                return;
            }
            base.WndProc(ref message);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            // A layered window is painted through UpdateLayeredWindow only.
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
        }

        public void ShowCard()
        {
            Show();
            SetForegroundWindow(Handle);
            Activate();
        }
    }

    internal static class CardGraphics
    {
        public static GraphicsPath Rounded(RectangleF rectangle, float radius)
        {
            GraphicsPath path = new GraphicsPath();
            float diameter = Math.Min(radius * 2f, Math.Min(rectangle.Width, rectangle.Height));
            RectangleF arc = new RectangleF(rectangle.X, rectangle.Y, diameter, diameter);
            path.AddArc(arc, 180, 90);
            arc.X = rectangle.Right - diameter;
            path.AddArc(arc, 270, 90);
            arc.Y = rectangle.Bottom - diameter;
            path.AddArc(arc, 0, 90);
            arc.X = rectangle.Left;
            path.AddArc(arc, 90, 90);
            path.CloseFigure();
            return path;
        }

        public static void DrawCard(Graphics graphics, RectangleF rectangle, Palette palette, float radius)
        {
            using (GraphicsPath path = Rounded(rectangle, radius))
            {
                using (SolidBrush fill = new SolidBrush(palette.Card))
                {
                    graphics.FillPath(fill, path);
                }
                using (Pen border = new Pen(palette.Border, Math.Max(1f, radius / 16f)))
                {
                    graphics.DrawPath(border, path);
                }
            }
        }

        public static void DrawButton(Graphics graphics, RectangleF rectangle, Palette palette, string text, Font font, bool primary, bool danger, bool hover, float scale)
        {
            Color fill = primary ? (hover ? palette.PrimaryHover : palette.Primary)
                : (hover ? palette.SecondaryHover : palette.Secondary);
            Color foreground = primary ? palette.PrimaryText : palette.SecondaryText;
            DrawFilledButton(graphics, rectangle, text, font, fill, foreground, scale);
        }

        public static void DrawNeutralButton(Graphics graphics, RectangleF rectangle, Palette palette, string text, Font font, bool hover, float scale)
        {
            Color fill = hover ? (palette.Dark ? palette.Border : palette.Separator) : palette.Hover;
            DrawFilledButton(graphics, rectangle, text, font, fill, palette.Text, scale);
        }

        private static void DrawFilledButton(Graphics graphics, RectangleF rectangle, string text, Font font, Color fill, Color foreground, float scale)
        {
            float radius = 10f * scale;
            using (GraphicsPath path = Rounded(rectangle, radius))
            {
                using (SolidBrush brush = new SolidBrush(fill))
                {
                    graphics.FillPath(brush, path);
                }
            }
            TextRenderer.DrawText(graphics, text, font,
                new Rectangle((int)rectangle.X, (int)rectangle.Y, (int)rectangle.Width, (int)rectangle.Height),
                foreground, TextFormatFlags.NoPadding | TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        public static void DrawThemeOption(Graphics graphics, RectangleF rectangle, Palette palette, string text, Font font, bool selected, bool hover)
        {
            if (selected || hover)
            {
                Color fill = selected
                    ? (palette.Dark ? Color.FromArgb(55, 58, 63) : Color.FromArgb(239, 241, 244))
                    : palette.Hover;
                using (GraphicsPath path = Rounded(rectangle, rectangle.Height / 2f))
                using (SolidBrush brush = new SolidBrush(fill))
                {
                    graphics.FillPath(brush, path);
                }
            }
            DrawText(graphics, text, font, rectangle, selected || hover ? palette.Text : palette.Muted,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }

        public static void DrawText(Graphics graphics, string text, Font font, RectangleF rectangle, Color color, TextFormatFlags flags)
        {
            TextRenderer.DrawText(graphics, text, font,
                new Rectangle((int)rectangle.X, (int)rectangle.Y, (int)Math.Ceiling(rectangle.Width), (int)Math.Ceiling(rectangle.Height)),
                color, flags | TextFormatFlags.NoPadding);
        }
    }
}
