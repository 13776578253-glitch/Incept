using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class ThemeTests
{
    private const BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    public static void Run(Assembly target, Action<string, Action> test)
    {
        Type manager = target.GetType("InceptSync.ThemeManager", true);
        Type modeType = target.GetType("InceptSync.ThemeMode", true);
        Type paletteType = target.GetType("InceptSync.Palette", true);
        string directory = Path.Combine(Path.GetTempPath(), "InceptSync-theme-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        Action initialize = delegate { manager.GetMethod("Initialize", Flags).Invoke(null, new object[] { directory }); };
        Action<string> select = delegate(string name) { manager.GetMethod("SetMode", Flags).Invoke(null, new object[] { Enum.Parse(modeType, name) }); };
        Func<string> mode = delegate { return manager.GetProperty("Mode", Flags).GetValue(null, null).ToString(); };
        Func<bool> dark = delegate { return (bool)manager.GetProperty("IsDark", Flags).GetValue(null, null); };
        Func<object> palette = delegate { return paletteType.GetMethod("Current", Flags).Invoke(null, null); };
        Func<object, string, Color> color = delegate(object value, string field) { return (Color)paletteType.GetField(field).GetValue(value); };
        string preference = Path.Combine(directory, "tray-settings.json");
        try
        {
            test("theme defaults to system and does not create preferences on load", delegate
            {
                initialize(); Require(mode() == "System" && !File.Exists(preference), "unexpected default/write");
            });
            test("theme selection persists and reloads light/dark/system", delegate
            {
                foreach (string name in new string[] { "Light", "Dark", "System" })
                {
                    select(name); initialize(); Require(mode() == name, "selection not restored: " + name);
                    Require(File.ReadAllText(preference).Contains(name.ToLowerInvariant()), "missing persisted selection");
                }
            });
            test("explicit themes are independent of the system theme", delegate
            {
                FieldInfo system = manager.GetField("_systemDark", Flags);
                select("Light"); system.SetValue(null, true); Require(!dark(), "light followed system");
                select("Dark"); system.SetValue(null, false); Require(dark(), "dark followed system");
                initialize();
            });
            test("theme events update shared palettes and leave Agent config untouched", delegate
            {
                string config = Path.Combine(directory, "config.json"); File.WriteAllText(config, "agent-config-sentinel");
                int notifications = 0;
                EventHandler handler = delegate { notifications++; };
                EventInfo changed = manager.GetEvent("Changed", Flags); changed.AddEventHandler(null, handler);
                try
                {
                    select("Light"); object shared = palette(); Color lightCard = color(shared, "Card");
                    select("Dark"); object current = palette();
                    Require(notifications == 2 && object.ReferenceEquals(shared, current), "palette/events not shared");
                    Require(lightCard != color(current, "Card") && color(current, "Card").R < 60, "palette did not change");
                    Require(File.ReadAllText(config) == "agent-config-sentinel", "Agent config changed");
                }
                finally { changed.RemoveEventHandler(null, handler); }
            });
            test("corrupt or unknown theme preferences fall back to system", delegate
            {
                foreach (string value in new string[] { "broken-json", "{\"theme\":\"unknown\"}" })
                {
                    File.WriteAllText(preference, value); initialize(); Require(mode() == "System", "bad preference fallback");
                }
            });
            test("soft green/blue buttons are opaque and use readable text in both themes", delegate
            {
                foreach (string name in new string[] { "Light", "Dark" })
                {
                    select(name); object colors = palette();
                    foreach (string role in new string[] { "Primary", "Secondary" })
                    {
                        Color fill = color(colors, role), text = color(colors, role + "Text");
                        Require(fill.A == 255 && Contrast(fill, text) >= 4.5, name + " " + role + " contrast");
                        Require(Contrast(color(colors, role + "Hover"), text) >= 4.5, name + " " + role + " hover contrast");
                    }
                    Color green = color(colors, "Primary"), blue = color(colors, "Secondary");
                    Require(green.G > green.R && green.G > green.B && blue.B > blue.G, "green/blue accent missing");
                    MethodInfo draw = target.GetType("InceptSync.CardGraphics").GetMethod("DrawButton", Flags);
                    using (Bitmap bitmap = new Bitmap(240, 50))
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    using (Font font = new Font("Segoe UI", 12f, FontStyle.Regular, GraphicsUnit.Pixel))
                    {
                        draw.Invoke(null, new object[] { graphics, new RectangleF(0, 0, 110, 44), colors, "", font, false, false, false, 1f });
                        draw.Invoke(null, new object[] { graphics, new RectangleF(120, 0, 110, 44), colors, "", font, false, true, false, 1f });
                        Require(bitmap.GetPixel(50, 20).ToArgb() == blue.ToArgb(), "secondary not solid blue");
                        Require(bitmap.GetPixel(170, 20).ToArgb() == blue.ToArgb(), "stop uses a different button color");
                    }
                }
            });
            test("theme options use a neutral selected pill and unfilled inactive text", delegate
            {
                MethodInfo draw = target.GetType("InceptSync.CardGraphics").GetMethod("DrawThemeOption", Flags);
                Color lightPrimary = Color.Empty, lightSecondary = Color.Empty;
                foreach (string name in new string[] { "Light", "Dark" })
                {
                    select(name); object colors = palette(); Color card = color(colors, "Card");
                    if (name == "Light") { lightPrimary = color(colors, "Primary"); lightSecondary = color(colors, "Secondary"); }
                    else Require(Luminance(color(colors, "Primary")) < Luminance(lightPrimary)
                        && Luminance(color(colors, "Secondary")) < Luminance(lightSecondary), "dark buttons should be darker");
                    using (Bitmap bitmap = new Bitmap(240, 50))
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    using (Font font = new Font("Segoe UI", 12f, FontStyle.Regular, GraphicsUnit.Pixel))
                    {
                        graphics.Clear(card);
                        draw.Invoke(null, new object[] { graphics, new RectangleF(0, 0, 110, 44), colors, "", font, true, false });
                        draw.Invoke(null, new object[] { graphics, new RectangleF(120, 0, 110, 44), colors, "", font, false, false });
                        Color selected = bitmap.GetPixel(50, 20);
                        Require(bitmap.GetPixel(170, 20).ToArgb() == card.ToArgb(), "inactive option has a fill");
                        Require(selected.ToArgb() != card.ToArgb() && Math.Abs(selected.R - selected.B) < 10, "selected option not neutral");
                        Require(Contrast(selected, color(colors, "Text")) >= 4.5
                            && Contrast(card, color(colors, "Muted")) >= 4.5, "theme option text contrast");
                    }
                }
            });
        }
        finally
        {
            select("System");
            string full = Path.GetFullPath(directory), parent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
            if (!string.Equals(Path.GetDirectoryName(full), parent, StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(full).StartsWith("InceptSync-theme-tests-", StringComparison.Ordinal)) throw new InvalidOperationException("Unsafe test directory");
            Directory.Delete(full, true);
            manager.GetMethod("Initialize", Flags).Invoke(null, new object[] { directory });
        }
    }

    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    private static double Linear(byte value) { double v = value / 255.0; return v <= 0.04045 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4); }
    private static double Luminance(Color color) { return 0.2126 * Linear(color.R) + 0.7152 * Linear(color.G) + 0.0722 * Linear(color.B); }
    private static double Contrast(Color a, Color b) { double x = Luminance(a), y = Luminance(b); return (Math.Max(x, y) + 0.05) / (Math.Min(x, y) + 0.05); }
}
