using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace InceptSync
{
    // Minimal JSON reader. The tray only reads tiny local files (status.json,
    // config.json), so a dependency free parser keeps the exe small and lets it
    // run on the .NET Framework that ships with Windows.
    internal static class Json
    {
        public static object Parse(string text)
        {
            int index = 0;
            object value = ParseValue(text, ref index);
            SkipWhitespace(text, ref index);
            if (index != text.Length)
            {
                throw new FormatException("Trailing JSON content");
            }
            return value;
        }

        public static string Serialize(object value)
        {
            StringBuilder builder = new StringBuilder();
            WriteValue(builder, value);
            return builder.ToString();
        }

        private static void WriteValue(StringBuilder builder, object value)
        {
            if (value == null)
            {
                builder.Append("null");
                return;
            }
            string text = value as string;
            if (text != null)
            {
                WriteString(builder, text);
                return;
            }
            if (value is bool)
            {
                builder.Append((bool)value ? "true" : "false");
                return;
            }
            if (value is int || value is long)
            {
                builder.Append(Convert.ToString(value, CultureInfo.InvariantCulture));
                return;
            }
            if (value is double)
            {
                builder.Append(((double)value).ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            Dictionary<string, object> map = value as Dictionary<string, object>;
            if (map != null)
            {
                builder.Append('{');
                bool first = true;
                foreach (KeyValuePair<string, object> pair in map)
                {
                    if (!first)
                    {
                        builder.Append(',');
                    }
                    first = false;
                    WriteString(builder, pair.Key);
                    builder.Append(':');
                    WriteValue(builder, pair.Value);
                }
                builder.Append('}');
                return;
            }
            System.Collections.IEnumerable list = value as System.Collections.IEnumerable;
            if (list != null)
            {
                builder.Append('[');
                bool first = true;
                foreach (object item in list)
                {
                    if (!first)
                    {
                        builder.Append(',');
                    }
                    first = false;
                    WriteValue(builder, item);
                }
                builder.Append(']');
                return;
            }
            WriteString(builder, value.ToString());
        }

        private static void WriteString(StringBuilder builder, string value)
        {
            builder.Append('"');
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (c < 32)
                        {
                            builder.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            builder.Append(c);
                        }
                        break;
                }
            }
            builder.Append('"');
        }

        public static Dictionary<string, object> AsObject(object value)
        {
            Dictionary<string, object> map = value as Dictionary<string, object>;
            if (map == null)
            {
                throw new FormatException("JSON object expected");
            }
            return map;
        }

        public static string Str(Dictionary<string, object> map, string key)
        {
            object value;
            if (map != null && map.TryGetValue(key, out value) && value is string)
            {
                return (string)value;
            }
            return null;
        }

        public static double Num(Dictionary<string, object> map, string key, double fallback)
        {
            object value;
            if (map != null && map.TryGetValue(key, out value))
            {
                if (value is double)
                {
                    return (double)value;
                }
                if (value is long)
                {
                    return (double)(long)value;
                }
            }
            return fallback;
        }

        public static bool Bool(Dictionary<string, object> map, string key)
        {
            object value;
            return map != null && map.TryGetValue(key, out value) && value is bool && (bool)value;
        }

        public static List<object> Arr(Dictionary<string, object> map, string key)
        {
            object value;
            if (map != null && map.TryGetValue(key, out value))
            {
                return value as List<object>;
            }
            return null;
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n'))
            {
                i++;
            }
        }

        private static object ParseValue(string s, ref int i)
        {
            SkipWhitespace(s, ref i);
            if (i >= s.Length)
            {
                throw new FormatException("Unexpected end of JSON");
            }
            char c = s[i];
            if (c == '{')
            {
                return ParseObject(s, ref i);
            }
            if (c == '[')
            {
                return ParseArray(s, ref i);
            }
            if (c == '"')
            {
                return ParseString(s, ref i);
            }
            if (c == 't')
            {
                Expect(s, ref i, "true");
                return true;
            }
            if (c == 'f')
            {
                Expect(s, ref i, "false");
                return false;
            }
            if (c == 'n')
            {
                Expect(s, ref i, "null");
                return null;
            }
            return ParseNumber(s, ref i);
        }

        private static void Expect(string s, ref int i, string literal)
        {
            if (string.CompareOrdinal(s, i, literal, 0, literal.Length) != 0)
            {
                throw new FormatException("Unexpected JSON token");
            }
            i += literal.Length;
        }

        private static Dictionary<string, object> ParseObject(string s, ref int i)
        {
            Dictionary<string, object> map = new Dictionary<string, object>(StringComparer.Ordinal);
            i++;
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == '}')
            {
                i++;
                return map;
            }
            while (true)
            {
                SkipWhitespace(s, ref i);
                if (i >= s.Length || s[i] != '"')
                {
                    throw new FormatException("JSON key expected");
                }
                string key = ParseString(s, ref i);
                SkipWhitespace(s, ref i);
                if (i >= s.Length || s[i] != ':')
                {
                    throw new FormatException("JSON colon expected");
                }
                i++;
                map[key] = ParseValue(s, ref i);
                SkipWhitespace(s, ref i);
                if (i >= s.Length)
                {
                    throw new FormatException("Unterminated JSON object");
                }
                if (s[i] == ',')
                {
                    i++;
                    continue;
                }
                if (s[i] == '}')
                {
                    i++;
                    return map;
                }
                throw new FormatException("JSON object separator expected");
            }
        }

        private static List<object> ParseArray(string s, ref int i)
        {
            List<object> list = new List<object>();
            i++;
            SkipWhitespace(s, ref i);
            if (i < s.Length && s[i] == ']')
            {
                i++;
                return list;
            }
            while (true)
            {
                list.Add(ParseValue(s, ref i));
                SkipWhitespace(s, ref i);
                if (i >= s.Length)
                {
                    throw new FormatException("Unterminated JSON array");
                }
                if (s[i] == ',')
                {
                    i++;
                    continue;
                }
                if (s[i] == ']')
                {
                    i++;
                    return list;
                }
                throw new FormatException("JSON array separator expected");
            }
        }

        private static string ParseString(string s, ref int i)
        {
            StringBuilder builder = new StringBuilder();
            i++;
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"')
                {
                    return builder.ToString();
                }
                if (c != '\\')
                {
                    builder.Append(c);
                    continue;
                }
                if (i >= s.Length)
                {
                    break;
                }
                char escape = s[i++];
                switch (escape)
                {
                    case '"': builder.Append('"'); break;
                    case '\\': builder.Append('\\'); break;
                    case '/': builder.Append('/'); break;
                    case 'b': builder.Append('\b'); break;
                    case 'f': builder.Append('\f'); break;
                    case 'n': builder.Append('\n'); break;
                    case 'r': builder.Append('\r'); break;
                    case 't': builder.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length)
                        {
                            throw new FormatException("Invalid JSON escape");
                        }
                        builder.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default:
                        throw new FormatException("Invalid JSON escape");
                }
            }
            throw new FormatException("Unterminated JSON string");
        }

        private static object ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && ("+-0123456789.eE".IndexOf(s[i]) >= 0))
            {
                i++;
            }
            if (start == i)
            {
                throw new FormatException("Invalid JSON number");
            }
            return double.Parse(s.Substring(start, i - start), CultureInfo.InvariantCulture);
        }
    }
}
