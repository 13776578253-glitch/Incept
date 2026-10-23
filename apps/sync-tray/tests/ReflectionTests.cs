// Compile with the Windows .NET Framework csc via tools/test.ps1.
// No application entry point, message loop, window display, CLI or agent calls.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows.Forms;

internal static class ReflectionTests
{
    private const BindingFlags Members = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
    private const string Prefix = "InceptSync.Assets.Icon.";
    private static Assembly target;
    private static Type snapshotType;
    private static Type stateType;
    private static Type factoryType;
    private static MethodInfo draw;
    private static MethodInfo iconFor;
    private static MethodInfo legacyFor;
    private static int passed;
    private static int failed;
    private static readonly string[] States = { "Offline", "Connected", "Syncing", "Paused", "Attention" };

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            // Match the app's DPI-aware GDI+ behavior without creating windows.
            SetProcessDPIAware();
            if (args.Length != 1) throw new ArgumentException("Expected a built InceptSync.exe path.");
            string path = Path.GetFullPath(args[0]);
            byte[] bytes;
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (MemoryStream copy = new MemoryStream())
            {
                file.CopyTo(copy);
                bytes = copy.ToArray();
            }
            // Byte loading avoids retaining a file lock on a running/reviewed exe.
            target = Assembly.Load(bytes);
            using (SHA256 sha = SHA256.Create())
                Console.WriteLine("Target: {0}\nSHA256: {1}", path, BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", ""));
            snapshotType = TypeOf("StatusSnapshot");
            stateType = TypeOf("AgentVisualState");
            factoryType = TypeOf("IconFactory");
            draw = factoryType.GetMethod("Draw", Members, null,
                new Type[] { typeof(Graphics), typeof(RectangleF), stateType, typeof(bool), typeof(int) }, null);
            iconFor = factoryType.GetMethod("For", Members, null, new Type[] { stateType, typeof(bool), typeof(int) }, null);
            legacyFor = factoryType.GetMethod("For", Members, null, new Type[] { stateType, typeof(bool) }, null);
            Require(draw != null && iconFor != null && legacyFor != null, "IconFactory interface missing");
            using (Bitmap probe = new Bitmap(1, 1))
            using (Graphics graphics = Graphics.FromImage(probe))
                Console.WriteLine("DPI-aware bitmap graphics: {0} x {1}", graphics.DpiX, graphics.DpiY);

            TestStates();
            Test("eleven embedded 160px artwork resources", TestResources);
            foreach (int size in new int[] { 24, 32, 40, 60 })
            {
                int capture = size;
                Test("Draw right/bottom coverage and pixels, " + size + "px at 96/144/192 DPI", delegate { TestPixels(capture); });
            }
            Test("eight distinct spinner frames and stable cyclic cache references", TestSpinner);
            Test("non-upload states do not grow either cache for arbitrary frames", TestStaticCache);
            Test("StatusPopup construction size and contained rows (never shown)", delegate { TestForm("StatusPopup", 360, 430, "_rows"); });
            Test("SettingsForm construction size and contained zones (never shown)", delegate { TestForm("SettingsForm", 540, 500, "_zones"); });
            Test("ExitDialog construction size and contained zones (never shown)", delegate { TestForm("ExitDialog", 440, 210, "_zones"); });
            ThemeTests.Run(target, Test);
            LocaleTests.Run(target, Test);
            PlacementTests.Run(target, Test);
        }
        catch (Exception error)
        {
            failed++;
            Console.WriteLine("FAIL harness: " + Unwrap(error));
        }
        Console.WriteLine("RESULT: {0} passed, {1} failed", passed, failed);
        return failed == 0 ? 0 : 1;
    }

    private static void Test(string name, Action body)
    {
        try { body(); passed++; Console.WriteLine("PASS " + name); }
        catch (Exception error) { failed++; Console.WriteLine("FAIL " + name + ": " + Unwrap(error)); }
    }

    private static Exception Unwrap(Exception error)
    {
        while (error is TargetInvocationException && error.InnerException != null) error = error.InnerException;
        return error;
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private static Type TypeOf(string name) { return target.GetType("InceptSync." + name, true); }
    private static object State(string name) { return Enum.Parse(stateType, name); }
    private static void Set(object instance, string name, object value) { instance.GetType().GetField(name, Members).SetValue(instance, value); }
    private static long NowMs() { return (DateTime.UtcNow.Ticks - new DateTime(1970, 1, 1).Ticks) / TimeSpan.TicksPerMillisecond; }
    private static object Snapshot(long now)
    {
        object snapshot = Activator.CreateInstance(snapshotType, true);
        Set(snapshot, "Running", true);
        Set(snapshot, "AtMs", now);
        Set(snapshot, "Activity", "idle");
        return snapshot;
    }

    private static void ExpectState(object snapshot, long now, string expected)
    {
        string actual = snapshotType.GetMethod("VisualState", Members).Invoke(snapshot, new object[] { now }).ToString();
        Require(actual == expected, "expected " + expected + ", got " + actual);
    }

    private static void StateCase(string name, string expected, Action<object, long> configure)
    {
        Test(name, delegate
        {
            long now = NowMs();
            object snapshot = Snapshot(now);
            configure(snapshot, now);
            ExpectState(snapshot, now, expected);
        });
    }

    private static void RecentError(object snapshot)
    {
        Set(snapshot, "LastErrorCode", "UPLOAD_FAILED");
        Set(snapshot, "LastErrorAt", DateTime.UtcNow.AddMinutes(-1).ToString("o"));
    }

    private static void TestStates()
    {
        StateCase("fresh idle is Connected", "Connected", delegate(object s, long n) { });
        StateCase("collecting is Connected", "Connected", delegate(object s, long n) { Set(s, "Activity", "collecting"); });
        StateCase("freshness includes exactly 15000ms", "Connected", delegate(object s, long n) { Set(s, "AtMs", n - 15000L); });
        StateCase("expired at 15001ms is Offline", "Offline", delegate(object s, long n) { Set(s, "AtMs", n - 15001L); });
        StateCase("not running is Offline", "Offline", delegate(object s, long n) { Set(s, "Running", false); });
        StateCase("missing heartbeat is Offline", "Offline", delegate(object s, long n) { Set(s, "AtMs", 0L); });
        StateCase("expired uploading/paused/error is Offline", "Offline", delegate(object s, long n)
        {
            Set(s, "AtMs", n - 15001L); Set(s, "Activity", "uploading"); Set(s, "Paused", true); RecentError(s);
        });
        StateCase("uploading is Syncing", "Syncing", delegate(object s, long n) { Set(s, "Activity", "uploading"); });
        StateCase("uploading wins over Paused", "Syncing", delegate(object s, long n) { Set(s, "Activity", "uploading"); Set(s, "Paused", true); });
        StateCase("uploading wins over residual error", "Syncing", delegate(object s, long n) { Set(s, "Activity", "uploading"); RecentError(s); });
        StateCase("uploading wins over paused plus error", "Syncing", delegate(object s, long n)
        {
            Set(s, "Activity", "uploading"); Set(s, "Paused", true); RecentError(s);
        });
        StateCase("paused idle is Paused", "Paused", delegate(object s, long n) { Set(s, "Paused", true); });
        StateCase("paused collecting with error is Paused", "Paused", delegate(object s, long n)
        {
            Set(s, "Activity", "collecting"); Set(s, "Paused", true); RecentError(s);
        });
        StateCase("recent upload error is Attention", "Attention", delegate(object s, long n) { RecentError(s); });
        StateCase("success older than error stays Attention", "Attention", delegate(object s, long n)
        {
            RecentError(s); Set(s, "LastSuccessfulSyncAt", DateTime.UtcNow.AddMinutes(-2).ToString("o"));
        });
        Test("Attention recovers after successful sync on same snapshot", delegate
        {
            long now = NowMs(); object snapshot = Snapshot(now); RecentError(snapshot);
            ExpectState(snapshot, now, "Attention");
            Set(snapshot, "LastSuccessfulSyncAt", DateTime.UtcNow.ToString("o"));
            ExpectState(snapshot, now, "Connected");
        });
        StateCase("success at error timestamp clears Attention", "Connected", delegate(object s, long n)
        {
            RecentError(s); Set(s, "LastSuccessfulSyncAt", snapshotType.GetField("LastErrorAt", Members).GetValue(s));
        });
        StateCase("error older than 30 minutes is Connected", "Connected", delegate(object s, long n)
        {
            RecentError(s); Set(s, "LastErrorAt", DateTime.UtcNow.AddMinutes(-31).ToString("o"));
        });
        StateCase("error without valid timestamp is Connected", "Connected", delegate(object s, long n)
        {
            RecentError(s); Set(s, "LastErrorAt", "invalid");
        });
        StateCase("pending batches without uploading stay Connected", "Connected", delegate(object s, long n) { Set(s, "PendingBatches", 12); });
    }

    private static string[] AssetNames()
    {
        return new string[] { "running", "paused", "offline", "sync-0", "sync-1", "sync-2", "sync-3", "sync-4", "sync-5", "sync-6", "sync-7" };
    }

    private static Bitmap ResourceBitmap(string name)
    {
        using (Stream stream = target.GetManifestResourceStream(Prefix + name + ".png"))
        {
            Require(stream != null, "missing resource " + name);
            using (Bitmap source = new Bitmap(stream))
                return source.Clone(new Rectangle(0, 0, source.Width, source.Height), PixelFormat.Format32bppArgb);
        }
    }

    private static void TestResources()
    {
        int count = 0;
        foreach (string resource in target.GetManifestResourceNames()) if (resource.StartsWith(Prefix, StringComparison.Ordinal)) count++;
        Require(count == 11, "expected 11 artwork resources, got " + count);
        foreach (string name in AssetNames())
        using (Bitmap bitmap = ResourceBitmap(name))
        {
            Require(bitmap.Width == 160 && bitmap.Height == 160, name + " must be 160x160");
            Require(bitmap.GetPixel(0, 0).A == 0 && bitmap.GetPixel(159, 159).A == 0, name + " corners must be transparent");
        }
    }

    private static Bitmap Render(string state, bool dark, int frame, int size, float dpi)
    {
        Bitmap bitmap = new Bitmap(size + 8, size + 8, PixelFormat.Format32bppArgb);
        try
        {
            bitmap.SetResolution(dpi, dpi);
            using (Graphics graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(Color.Transparent);
                draw.Invoke(null, new object[] { graphics, new RectangleF(4, 4, size, size), State(state), dark, frame });
            }
            return bitmap;
        }
        catch { bitmap.Dispose(); throw; }
    }

    private static void CheckCoverage(Bitmap bitmap, int size, string label)
    {
        // Interior strips at 75-85% cover the exact right/bottom areas lost
        // when DrawImageUnscaled applied a 96/144 DPI ratio during LoadAsset.
        int solid = 0, samples = 0;
        for (int a = (int)(size * 0.75f); a < (int)(size * 0.85f); a++)
        for (int b = (int)(size * 0.30f); b < (int)(size * 0.70f); b++)
        {
            if (bitmap.GetPixel(4 + a, 4 + b).A >= 200) solid++;
            if (bitmap.GetPixel(4 + b, 4 + a).A >= 200) solid++;
            samples += 2;
        }
        Require(samples > 0 && solid >= samples * 0.95, label + " right/bottom coverage " + solid + "/" + samples);
        Require(bitmap.GetPixel(0, 0).A == 0 && bitmap.GetPixel(size + 7, size + 7).A == 0, label + " drew outside bounds");
    }

    private static void TestPixels(int size)
    {
        foreach (float dpi in new float[] { 96, 144, 192 })
        foreach (bool dark in new bool[] { false, true })
        foreach (string state in States)
        {
            int frames = state == "Syncing" ? 8 : 1;
            for (int frame = 0; frame < frames; frame++)
            using (Bitmap actual = Render(state, dark, frame, size, dpi))
            {
                string label = state + " frame " + frame + " dpi " + dpi;
                CheckCoverage(actual, size, label);
                if (state == "Attention") continue; // Badge deliberately changes source pixels.
                string name = state == "Syncing" ? "sync-" + frame : state == "Paused" ? "paused" : state == "Offline" ? "offline" : "running";
                using (Bitmap source = ResourceBitmap(name))
                using (Bitmap expected = new Bitmap(size + 8, size + 8, PixelFormat.Format32bppArgb))
                {
                    expected.SetResolution(dpi, dpi);
                    using (Graphics graphics = Graphics.FromImage(expected))
                    {
                        graphics.Clear(Color.Transparent);
                        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                        graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                        graphics.DrawImage(source, new RectangleF(4, 4, size, size), new RectangleF(0, 0, source.Width, source.Height), GraphicsUnit.Pixel);
                    }
                    Require(Fingerprint(actual) == Fingerprint(expected), label + " differs from complete embedded artwork");
                }
            }
        }
    }

    private static string Fingerprint(Bitmap bitmap)
    {
        byte[] pixels = new byte[bitmap.Width * bitmap.Height * 4];
        int index = 0;
        for (int y = 0; y < bitmap.Height; y++)
        for (int x = 0; x < bitmap.Width; x++)
        {
            int pixel = bitmap.GetPixel(x, y).ToArgb();
            pixels[index++] = (byte)pixel; pixels[index++] = (byte)(pixel >> 8);
            pixels[index++] = (byte)(pixel >> 16); pixels[index++] = (byte)(pixel >> 24);
        }
        using (SHA256 sha = SHA256.Create()) return Convert.ToBase64String(sha.ComputeHash(pixels));
    }

    private static Icon IconFor(string state, bool dark, int frame)
    {
        // Cached icons belong to the target factory; never dispose them here.
        return (Icon)iconFor.Invoke(null, new object[] { State(state), dark, frame });
    }

    private static IDictionary Cache(string name) { return (IDictionary)factoryType.GetField(name, Members).GetValue(null); }

    private static void TestSpinner()
    {
        Require((int)factoryType.GetField("SpinnerFrameCount", Members).GetRawConstantValue() == 8, "spinner count must be eight");
        foreach (bool dark in new bool[] { false, true })
        {
            HashSet<string> images = new HashSet<string>();
            HashSet<string> icons = new HashSet<string>();
            for (int frame = 0; frame < 8; frame++)
            {
                using (Bitmap bitmap = Render("Syncing", dark, frame, 40, 144)) images.Add(Fingerprint(bitmap));
                Icon icon = IconFor("Syncing", dark, frame);
                using (Bitmap bitmap = icon.ToBitmap()) icons.Add(Fingerprint(bitmap));
                for (int cycle = -16; cycle <= 16; cycle++)
                    Require(object.ReferenceEquals(icon, IconFor("Syncing", dark, frame + cycle * 8)), "cyclic icon cache reference changed");
                using (Bitmap current = Render("Syncing", dark, frame, 40, 144))
                using (Bitmap next = Render("Syncing", dark, frame + 8, 40, 144))
                    Require(Fingerprint(current) == Fingerprint(next), "Draw frame does not wrap at eight");
            }
            Require(images.Count == 8 && icons.Count == 8, "spinner frames must be distinct at panel and tray sizes");
            Require(object.ReferenceEquals(legacyFor.Invoke(null, new object[] { State("Syncing"), dark }), IconFor("Syncing", dark, 0)), "legacy overload must use frame zero");
            Require(object.ReferenceEquals(IconFor("Syncing", dark, int.MinValue), IconFor("Syncing", dark, 0)), "minimum frame modulo");
            Require(object.ReferenceEquals(IconFor("Syncing", dark, int.MaxValue), IconFor("Syncing", dark, 7)), "maximum frame modulo");
        }
    }

    private static void TestStaticCache()
    {
        foreach (string state in States)
        foreach (bool dark in new bool[] { false, true }) IconFor(state, dark, 0);
        int icons = Cache("Cache").Count;
        int assets = Cache("AssetCache").Count;
        foreach (string state in States)
        {
            if (state == "Syncing") continue;
            foreach (bool dark in new bool[] { false, true })
            {
                Icon baseline = IconFor(state, dark, 0);
                string pixels;
                using (Bitmap bitmap = Render(state, dark, 0, 32, 144)) pixels = Fingerprint(bitmap);
                for (int frame = -128; frame <= 128; frame++)
                    Require(object.ReferenceEquals(baseline, IconFor(state, dark, frame)), state + " added per-frame icons");
                foreach (int frame in new int[] { -17, 8, 99999, int.MinValue, int.MaxValue })
                {
                    Require(object.ReferenceEquals(baseline, IconFor(state, dark, frame)), state + " extreme frame cache");
                    using (Bitmap bitmap = Render(state, dark, frame, 32, 144)) Require(pixels == Fingerprint(bitmap), state + " animated unexpectedly");
                }
                Require(object.ReferenceEquals(baseline, legacyFor.Invoke(null, new object[] { State(state), dark })), state + " legacy overload");
            }
        }
        Require(Cache("Cache").Count == icons && Cache("AssetCache").Count == assets, "cache grew for non-upload frames");
        Require(icons == 24 && assets == 11, "expected 24 final icons and 11 small assets, got " + icons + "/" + assets);
        foreach (DictionaryEntry entry in Cache("AssetCache"))
        {
            Bitmap bitmap = (Bitmap)entry.Value;
            Require(bitmap.Width == 160 && bitmap.Height == 160, "runtime retained oversized source " + entry.Key);
        }
        Console.WriteLine("  Cache: {0} final icons, {1} decoded 160px assets", icons, assets);
    }

    private static void TestForm(string name, int widthUnits, int heightUnits, string boundsField)
    {
        string isolated = Path.Combine(Path.GetTempPath(), "InceptSync-no-state-" + Guid.NewGuid().ToString("N"));
        object agent = Activator.CreateInstance(TypeOf("AgentClient"), Members, null, new object[] { isolated, isolated }, null);
        object[] arguments = name == "StatusPopup" ? new object[] { agent, Snapshot(NowMs()) }
            : name == "SettingsForm" ? new object[] { agent } : new object[] { 7 };
        using (Form form = (Form)Activator.CreateInstance(TypeOf(name), Members, null, arguments, null))
        {
            Require(!form.Visible && !form.IsHandleCreated, name + " constructor created a window handle or showed a window");
            float dpiScale = (float)TypeOf("Dpi").GetMethod("Scale", Members).Invoke(null, null);
            float scale = (float)TypeOf("LayeredCard").GetField("S", Members).GetValue(form);
            Require(Math.Abs(scale - dpiScale * 0.84f) < 0.0001f, name + " compact DPI scale");
            Size expected = new Size((int)Math.Round(widthUnits * dpiScale * 0.84f), (int)Math.Round(heightUnits * dpiScale * 0.84f));
            Require(form.Size == expected && form.ClientSize == expected, name + " expected " + expected + ", got " + form.Size);
            Require(form.AutoScaleMode == AutoScaleMode.None && form.FormBorderStyle == FormBorderStyle.None, name + " unexpected native scaling/border");
            IList regions = (IList)form.GetType().GetField(boundsField, Members).GetValue(form);
            Require(regions.Count > 0, name + " missing action regions");
            foreach (object region in regions)
            {
                RectangleF bounds = (RectangleF)region.GetType().GetField("Bounds", Members).GetValue(region);
                Require(bounds.Width > 0 && bounds.Height > 0 && bounds.Left >= 0 && bounds.Top >= 0 && bounds.Right <= form.ClientSize.Width && bounds.Bottom <= form.ClientSize.Height,
                    name + " action region outside client area: " + bounds);
            }
            Console.WriteLine("  {0}: {1} x {2}, S={3:F2}, no window handle", name, form.Width, form.Height, scale);
            Require(!form.Visible && !form.IsHandleCreated, name + " test created a window handle");
        }
    }
}
