using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace InceptSync
{
    internal static class NativeMethods
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern bool DestroyIcon(IntPtr handle);
    }

    internal sealed class Palette
    {
        public Color Card;
        public Color Text;
        public Color Muted;
        public Color Hover;
        public Color Separator;
        public Color Border;
        public Color Primary;
        public Color PrimaryHover;
        public Color PrimaryText;
        public Color Secondary;
        public Color SecondaryHover;
        public Color SecondaryText;
        public bool Dark;
        private static readonly Palette Shared = new Palette();

        public static Palette Current()
        {
            Palette palette = Shared;
            palette.Dark = ThemeManager.IsDark;
            if (palette.Dark)
            {
                palette.Card = Color.FromArgb(27, 28, 30);
                palette.Text = Color.FromArgb(245, 246, 247);
                palette.Muted = Color.FromArgb(166, 171, 179);
                palette.Hover = Color.FromArgb(42, 44, 48);
                palette.Separator = Color.FromArgb(47, 50, 55);
                palette.Border = Color.FromArgb(58, 61, 66);
                palette.Primary = Color.FromArgb(45, 95, 75);
                palette.PrimaryHover = Color.FromArgb(55, 111, 88);
                palette.PrimaryText = Color.FromArgb(222, 242, 233);
                palette.Secondary = Color.FromArgb(47, 70, 102);
                palette.SecondaryHover = Color.FromArgb(57, 84, 119);
                palette.SecondaryText = Color.FromArgb(224, 235, 250);
            }
            else
            {
                palette.Card = Color.White;
                palette.Text = Color.FromArgb(17, 24, 39);
                palette.Muted = Color.FromArgb(107, 114, 128);
                palette.Hover = Color.FromArgb(243, 244, 246);
                palette.Separator = Color.FromArgb(229, 231, 235);
                palette.Border = Color.FromArgb(209, 213, 219);
                palette.Primary = Color.FromArgb(167, 228, 200);
                palette.PrimaryHover = Color.FromArgb(146, 216, 184);
                palette.PrimaryText = Color.FromArgb(20, 65, 48);
                palette.Secondary = Color.FromArgb(214, 230, 248);
                palette.SecondaryHover = Color.FromArgb(193, 216, 242);
                palette.SecondaryText = Color.FromArgb(34, 57, 85);
            }
            return palette;
        }

        public Color StateColor(AgentVisualState state)
        {
            switch (state)
            {
                case AgentVisualState.Connected: return Dark ? Color.FromArgb(52, 211, 153) : Color.FromArgb(20, 140, 100);
                case AgentVisualState.Syncing:
                case AgentVisualState.Paused: return Dark ? Color.FromArgb(251, 191, 36) : Color.FromArgb(161, 98, 7);
                case AgentVisualState.Attention: return Dark ? Color.FromArgb(248, 113, 113) : Color.FromArgb(190, 40, 40);
                default: return Dark ? Color.FromArgb(148, 163, 184) : Color.FromArgb(100, 116, 139);
            }
        }
    }

    // The build embeds 160 px, transparent versions of the supplied artwork.
    // Runtime only keeps those small decoded images and the final icon sizes.
    internal static class IconFactory
    {
        public const int SpinnerFrameCount = 8;

        private const string ResourcePrefix = "InceptSync.Assets.Icon.";
        private const string RunningAsset = "running";
        private const string PausedAsset = "paused";
        private const string OfflineAsset = "offline";
        private static readonly string[] SpinnerAssets =
        {
            "sync-0",
            "sync-1",
            "sync-2",
            "sync-3",
            "sync-4",
            "sync-5",
            "sync-6",
            "sync-7"
        };

        private static readonly Dictionary<string, Icon> Cache = new Dictionary<string, Icon>();
        private static readonly Dictionary<string, Bitmap> AssetCache = new Dictionary<string, Bitmap>();

        public static Icon For(AgentVisualState state, bool dark)
        {
            return For(state, dark, 0);
        }

        public static Icon For(AgentVisualState state, bool dark, int frame)
        {
            int size = Math.Max(32, SystemInformation.SmallIconSize.Width);
            int normalizedFrame = NormalizeFrame(state, frame);
            string key = state.ToString() + (dark ? "-d" : "-l") + "-" + size + "-" + normalizedFrame;
            lock (Cache)
            {
                Icon cached;
                if (Cache.TryGetValue(key, out cached))
                {
                    return cached;
                }
            }
            Icon icon = Build(state, size, dark, normalizedFrame);
            lock (Cache)
            {
                Icon existing;
                if (Cache.TryGetValue(key, out existing))
                {
                    icon.Dispose();
                    return existing;
                }
                Cache.Add(key, icon);
            }
            return icon;
        }

        public static void Draw(Graphics graphics, RectangleF bounds, AgentVisualState state, bool dark, int frame)
        {
            if (graphics == null || bounds.Width <= 0 || bounds.Height <= 0)
            {
                return;
            }

            Bitmap artwork = Asset(AssetName(state, frame));
            GraphicsState saved = graphics.Save();
            try
            {
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.DrawImage(
                    artwork,
                    bounds,
                    new RectangleF(0, 0, artwork.Width, artwork.Height),
                    GraphicsUnit.Pixel);
                if (state == AgentVisualState.Attention)
                {
                    DrawBadge(graphics, bounds, state, dark);
                }
            }
            finally
            {
                graphics.Restore(saved);
            }
        }

        private static Icon Build(AgentVisualState state, int size, bool dark, int frame)
        {
            using (Bitmap bitmap = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(Color.Transparent);
                Draw(graphics, new RectangleF(0, 0, size, size), state, dark, frame);
                IntPtr handle = bitmap.GetHicon();
                try
                {
                    using (Icon temporary = Icon.FromHandle(handle))
                    {
                        return (Icon)temporary.Clone();
                    }
                }
                finally
                {
                    NativeMethods.DestroyIcon(handle);
                }
            }
        }

        private static string AssetName(AgentVisualState state, int frame)
        {
            switch (state)
            {
                case AgentVisualState.Syncing:
                    return SpinnerAssets[NormalizeFrame(state, frame)];
                case AgentVisualState.Paused:
                    return PausedAsset;
                case AgentVisualState.Offline:
                    return OfflineAsset;
                default:
                    return RunningAsset;
            }
        }

        private static int NormalizeFrame(AgentVisualState state, int frame)
        {
            if (state != AgentVisualState.Syncing)
            {
                return 0;
            }
            int normalized = frame % SpinnerFrameCount;
            return normalized < 0 ? normalized + SpinnerFrameCount : normalized;
        }

        private static Bitmap Asset(string name)
        {
            lock (AssetCache)
            {
                Bitmap cached;
                if (AssetCache.TryGetValue(name, out cached))
                {
                    return cached;
                }
                Bitmap loaded = LoadAsset(name);
                AssetCache.Add(name, loaded);
                return loaded;
            }
        }

        private static Bitmap LoadAsset(string name)
        {
            string resource = ResourcePrefix + name + ".png";
            using (Stream stream = typeof(IconFactory).Assembly.GetManifestResourceStream(resource))
            {
                if (stream == null)
                {
                    throw new InvalidOperationException("Embedded icon resource is missing: " + resource);
                }
                using (Bitmap source = new Bitmap(stream))
                {
                    // Clone pixels directly: DrawImageUnscaled can apply the
                    // screen/image DPI ratio and clip artwork on a 150% desktop.
                    return source.Clone(new Rectangle(0, 0, source.Width, source.Height), PixelFormat.Format32bppArgb);
                }
            }
        }

        private static void DrawBadge(Graphics graphics, RectangleF bounds, AgentVisualState state, bool dark)
        {
            float diameter = Math.Max(6f, bounds.Width * 0.34f);
            float inset = Math.Max(0.5f, bounds.Width * 0.015f);
            RectangleF badge = new RectangleF(
                bounds.Right - diameter - inset,
                bounds.Top + inset,
                diameter,
                diameter);
            Color color = state == AgentVisualState.Attention
                ? Color.FromArgb(239, 68, 68)
                : Color.FromArgb(100, 116, 139);
            Color border = dark ? Color.FromArgb(27, 28, 30) : Color.White;

            using (SolidBrush fill = new SolidBrush(color))
            using (Pen outline = new Pen(border, Math.Max(1f, diameter * 0.1f)))
            using (SolidBrush mark = new SolidBrush(Color.White))
            {
                graphics.FillEllipse(fill, badge);
                graphics.DrawEllipse(outline, badge);
                float cx = badge.X + badge.Width / 2f;
                float cy = badge.Y + badge.Height / 2f;
                if (state == AgentVisualState.Attention)
                {
                    float width = Math.Max(1.4f, diameter * 0.15f);
                    float top = badge.Y + diameter * 0.24f;
                    float stemBottom = badge.Y + diameter * 0.58f;
                    using (Pen stem = new Pen(Color.White, width))
                    {
                        stem.StartCap = LineCap.Round;
                        stem.EndCap = LineCap.Round;
                        graphics.DrawLine(stem, cx, top, cx, stemBottom);
                    }
                    float dot = Math.Max(1.4f, diameter * 0.16f);
                    graphics.FillEllipse(mark, cx - dot / 2f, badge.Y + diameter * 0.7f, dot, dot);
                }
                else
                {
                    float width = Math.Max(1.4f, diameter * 0.12f);
                    float length = diameter * 0.46f;
                    using (Pen dash = new Pen(Color.White, width))
                    {
                        dash.StartCap = LineCap.Round;
                        dash.EndCap = LineCap.Round;
                        graphics.DrawLine(dash, cx - length / 2f, cy, cx + length / 2f, cy);
                    }
                }
            }
        }
    }
}
