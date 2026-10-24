package org.json;
import java.util.*;
public class JSONObject {
  public static final Object NULL = new Object() { @Override public boolean equals(Object o) { return o == this || o == null; } @Override public int hashCode() { return 0; } @Override public String toString() { return "null"; } };
  final LinkedHashMap<String, Object> map = new LinkedHashMap<>();
  public JSONObject() {}
  public JSONObject(String s) throws JSONException { this(new JSONTokener(s)); }
  public JSONObject(JSONTokener t) throws JSONException { Object o = t.nextValue(); if (!(o instanceof JSONObject)) throw new JSONException("Not a JSONObject"); map.putAll(((JSONObject) o).map); }
  public int length() { return map.size(); }
  public Object opt(String k) { return k == null ? null : map.get(k); }
  public boolean has(String k) { return map.containsKey(k); }
  public boolean isNull(String k) { Object v = opt(k); return v == null || v == NULL; }
  public JSONObject optJSONObject(String k) { Object v = opt(k); return v instanceof JSONObject ? (JSONObject) v : null; }
  public JSONArray optJSONArray(String k) { Object v = opt(k); return v instanceof JSONArray ? (JSONArray) v : null; }
  public long optLong(String k) { return optLong(k, 0L); }
  public long optLong(String k, long d) { Long r = JSON.toLong(opt(k)); return r != null ? r : d; }
  public int optInt(String k) { return optInt(k, 0); }
  public int optInt(String k, int d) { Integer r = JSON.toInteger(opt(k)); return r != null ? r : d; }
  public String optString(String k) { return optString(k, ""); }
  public String optString(String k, String d) { String r = JSON.toString(opt(k)); return r != null ? r : d; }
  public double optDouble(String k) { return optDouble(k, Double.NaN); }
  public double optDouble(String k, double d) { Double r = JSON.toDouble(opt(k)); return r != null ? r : d; }
  public boolean optBoolean(String k) { return optBoolean(k, false); }
  public boolean optBoolean(String k, boolean d) { Boolean r = JSON.toBoolean(opt(k)); return r != null ? r : d; }
  public JSONObject put(String k, Object v) throws JSONException { if (k == null) throw new JSONException("null key"); if (v == null) { map.remove(k); return this; } if (v instanceof Number) JSON.checkDouble(((Number) v).doubleValue()); map.put(k, v); return this; }
  public JSONObject put(String k, int v) throws JSONException { map.put(k, v); return this; }
  public JSONObject put(String k, long v) throws JSONException { map.put(k, v); return this; }
  public JSONObject put(String k, double v) throws JSONException { map.put(k, JSON.checkDouble(v)); return this; }
  public JSONObject put(String k, boolean v) throws JSONException { map.put(k, v); return this; }
  public Iterator<String> keys() { return map.keySet().iterator(); }
  static String numberToString(Number n) { double d = n.doubleValue(); if (n.equals(-0d)) return "-0"; long l = n.longValue(); if (d == (double) l) return Long.toString(l); return n.toString(); }
  static void write(StringBuilder sb, Object v) {
    if (v == null || v == NULL) sb.append("null");
    else if (v instanceof JSONObject) sb.append(v.toString());
    else if (v instanceof JSONArray) sb.append(v.toString());
    else if (v instanceof Boolean) sb.append(v);
    else if (v instanceof Number) sb.append(numberToString((Number) v));
    else quote(sb, v.toString());
  }
  static void quote(StringBuilder sb, String s) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) { char c = s.charAt(i);
      switch (c) { case '"': case '\\': case '/': sb.append('\\').append(c); break; case '\t': sb.append("\\t"); break; case '\b': sb.append("\\b"); break; case '\n': sb.append("\\n"); break; case '\r': sb.append("\\r"); break; case '\f': sb.append("\\f"); break;
        default: if (c <= 0x1F) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); } }
    sb.append('"');
  }
  @Override public String toString() { StringBuilder sb = new StringBuilder("{"); boolean first = true; for (Map.Entry<String, Object> e : map.entrySet()) { if (!first) sb.append(','); first = false; quote(sb, e.getKey()); sb.append(':'); write(sb, e.getValue()); } return sb.append('}').toString(); }
}
