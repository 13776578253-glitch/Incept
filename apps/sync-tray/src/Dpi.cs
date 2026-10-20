using System;
using Microsoft.Win32;

namespace InceptSync
{
    // WinForms on .NET Framework reports 96 for Control.DeviceDpi unless the
    // process opts into per-monitor handling. The logon DPI from the registry
    // keeps the card and dialogs sharp at 125%/150%, the common laptop setting.
    internal static class Dpi
    {
        public static float Scale()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Control Panel\Desktop\WindowMetrics"))
                {
                    if (key != null)
                    {
                        object value = key.GetValue("AppliedDPI");
                        if (value is int && (int)value > 0)
                        {
                            return Math.Max(1f, (int)value / 96f);
                        }
                    }
                }
            }
            catch
            {
            }
            return 1f;
        }
    }
}
