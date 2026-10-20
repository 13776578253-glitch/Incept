using System;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;

internal static class PlacementTests
{
    public static void Run(Assembly target, Action<string, Action> test)
    {
        Type placementType = target.GetType("InceptSync.TrayPlacement", true);
        MethodInfo calculate = placementType.GetMethod(
            "Calculate",
            BindingFlags.Public | BindingFlags.Static,
            null,
            new Type[] { typeof(Rectangle), typeof(Rectangle), typeof(Size), typeof(int) },
            null);
        MethodInfo locationFor = placementType.GetMethod(
            "LocationFor",
            BindingFlags.Public | BindingFlags.Static,
            null,
            new Type[] { typeof(NotifyIcon), typeof(Size), typeof(int) },
            null);
        if (calculate == null || locationFor == null)
        {
            throw new InvalidOperationException("TrayPlacement public interface is incomplete");
        }

        Action<Rectangle, Rectangle, Size, int, Point> expect = delegate(
            Rectangle workArea, Rectangle iconBounds, Size cardSize, int gap, Point expected)
        {
            Point actual = (Point)calculate.Invoke(null, new object[] { workArea, iconBounds, cardSize, gap });
            if (!actual.Equals(expected))
            {
                throw new InvalidOperationException(
                    "expected " + expected + ", got " + actual +
                    " for work=" + workArea + " icon=" + iconBounds +
                    " card=" + cardSize + " gap=" + gap);
            }
        };

        test("same tray icon and card always produce one fixed location", delegate
        {
            Rectangle workArea = new Rectangle(0, 0, 1920, 1040);
            Rectangle iconBounds = new Rectangle(1888, 1008, 16, 16);
            Size cardSize = new Size(360, 430);
            Point expected = new Point(1544, 570);
            for (int attempt = 0; attempt < 20; attempt++)
            {
                expect(workArea, iconBounds, cardSize, 8, expected);
            }
        });

        test("bottom-right anchor is above and right-aligned to the tray icon", delegate
        {
            expect(
                new Rectangle(0, 0, 1920, 1040),
                new Rectangle(1888, 1008, 16, 16),
                new Size(360, 430),
                8,
                new Point(1544, 570));
        });

        test("left edge clamps while preserving the vertical icon anchor", delegate
        {
            expect(
                new Rectangle(0, 0, 1920, 1040),
                new Rectangle(0, 980, 16, 16),
                new Size(360, 430),
                8,
                new Point(0, 542));
        });

        test("top edge clamps while preserving the horizontal icon anchor", delegate
        {
            expect(
                new Rectangle(0, 0, 1920, 1040),
                new Rectangle(1888, 8, 16, 16),
                new Size(360, 430),
                8,
                new Point(1544, 0));
        });

        test("negative-origin monitor coordinates remain stable", delegate
        {
            expect(
                new Rectangle(-1920, -1080, 1920, 1040),
                new Rectangle(-16, -56, 16, 16),
                new Size(360, 430),
                8,
                new Point(-360, -494));
        });

        test("oversized card keeps its top-left corner in the working area", delegate
        {
            expect(
                new Rectangle(-1920, 0, 1920, 1040),
                new Rectangle(-16, 1000, 16, 16),
                new Size(2400, 1200),
                8,
                new Point(-1920, 0));
        });

        test("right and bottom boundaries clamp deterministically", delegate
        {
            expect(
                new Rectangle(100, 50, 800, 600),
                new Rectangle(950, 700, 20, 20),
                new Size(320, 240),
                12,
                new Point(580, 410));
        });
    }
}
