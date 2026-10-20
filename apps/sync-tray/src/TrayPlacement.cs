using System;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace InceptSync
{
    internal static class TrayPlacement
    {
        private const int FallbackIconSize = 16;

        private static readonly object LastBoundsLock = new object();
        private static Rectangle lastIconBounds;
        private static bool hasLastIconBounds;
        public static string AnchorSource { get; private set; }
        public static Rectangle AnchorBounds { get; private set; }

        [StructLayout(LayoutKind.Sequential)]
        private struct NotifyIconIdentifier
        {
            public uint cbSize;
            public IntPtr hWnd;
            public uint uID;
            public Guid guidItem;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeRect
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [DllImport("shell32.dll")]
        private static extern int Shell_NotifyIconGetRect(ref NotifyIconIdentifier identifier, out NativeRect iconLocation);

        public static Point LocationFor(NotifyIcon icon, Size cardSize, int gap)
        {
            Rectangle iconBounds;
            if (TryGetIconBounds(icon, out iconBounds))
            {
                AnchorSource = "shell";
                AnchorBounds = iconBounds;
                RememberIconBounds(iconBounds);
                return Calculate(WorkingAreaFor(iconBounds), iconBounds, cardSize, gap);
            }

            if (TryGetLastIconBounds(out iconBounds))
            {
                AnchorSource = "cached";
                AnchorBounds = iconBounds;
                return Calculate(WorkingAreaFor(iconBounds), iconBounds, cardSize, gap);
            }

            Rectangle primaryWorkArea = PrimaryWorkingArea();
            Rectangle fallbackBounds = new Rectangle(
                primaryWorkArea.Right - FallbackIconSize,
                primaryWorkArea.Bottom - FallbackIconSize,
                FallbackIconSize,
                FallbackIconSize);
            AnchorSource = "work-area";
            AnchorBounds = fallbackBounds;
            return Calculate(primaryWorkArea, fallbackBounds, cardSize, gap);
        }

        public static Point Calculate(Rectangle workArea, Rectangle iconBounds, Size cardSize, int gap)
        {
            int cardWidth = Math.Max(0, cardSize.Width);
            int cardHeight = Math.Max(0, cardSize.Height);
            int safeGap = Math.Max(0, gap);

            long desiredX = (long)iconBounds.Right - cardWidth;
            long desiredY = (long)iconBounds.Top - safeGap - cardHeight;

            return new Point(
                FitCoordinate(desiredX, workArea.Left, workArea.Width, cardWidth),
                FitCoordinate(desiredY, workArea.Top, workArea.Height, cardHeight));
        }

        private static int FitCoordinate(long desired, int origin, int available, int extent)
        {
            if (available <= 0 || extent >= available)
            {
                return origin;
            }

            long maximum = (long)origin + available - extent;
            if (desired < origin)
            {
                return origin;
            }
            if (desired > maximum)
            {
                return (int)maximum;
            }
            return (int)desired;
        }

        private static bool TryGetIconBounds(NotifyIcon icon, out Rectangle bounds)
        {
            bounds = Rectangle.Empty;
            if (icon == null)
            {
                return false;
            }

            try
            {
                BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
                FieldInfo windowField = typeof(NotifyIcon).GetField("window", flags);
                FieldInfo idField = typeof(NotifyIcon).GetField("id", flags);
                if (windowField == null || idField == null)
                {
                    return false;
                }

                NativeWindow window = windowField.GetValue(icon) as NativeWindow;
                object idValue = idField.GetValue(icon);
                if (window == null || !(idValue is int))
                {
                    return false;
                }

                IntPtr handle = window.Handle;
                if (handle == IntPtr.Zero)
                {
                    return false;
                }

                NotifyIconIdentifier identifier = new NotifyIconIdentifier();
                identifier.cbSize = (uint)Marshal.SizeOf(typeof(NotifyIconIdentifier));
                identifier.hWnd = handle;
                identifier.uID = unchecked((uint)(int)idValue);
                identifier.guidItem = Guid.Empty;

                NativeRect nativeBounds;
                if (Shell_NotifyIconGetRect(ref identifier, out nativeBounds) != 0)
                {
                    return false;
                }

                bounds = Rectangle.FromLTRB(nativeBounds.Left, nativeBounds.Top, nativeBounds.Right, nativeBounds.Bottom);
                return bounds.Width > 0 && bounds.Height > 0;
            }
            catch
            {
                return false;
            }
        }

        private static void RememberIconBounds(Rectangle bounds)
        {
            lock (LastBoundsLock)
            {
                lastIconBounds = bounds;
                hasLastIconBounds = true;
            }
        }

        private static bool TryGetLastIconBounds(out Rectangle bounds)
        {
            lock (LastBoundsLock)
            {
                bounds = lastIconBounds;
                return hasLastIconBounds;
            }
        }

        private static Rectangle WorkingAreaFor(Rectangle iconBounds)
        {
            try
            {
                Screen screen = Screen.FromRectangle(iconBounds);
                if (screen != null && screen.WorkingArea.Width > 0 && screen.WorkingArea.Height > 0)
                {
                    return screen.WorkingArea;
                }
            }
            catch
            {
            }
            return PrimaryWorkingArea();
        }

        private static Rectangle PrimaryWorkingArea()
        {
            Screen primary = Screen.PrimaryScreen;
            return primary == null ? SystemInformation.WorkingArea : primary.WorkingArea;
        }
    }
}
