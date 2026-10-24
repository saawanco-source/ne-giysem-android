package org.json;
import java.util.*;
public class JSONArray {
  final ArrayList<Object> list = new ArrayList<>();
  public JSONArray() {}
  public JSONArray(String s) throws JSONException { Object o = new JSONTokener(s).nextValue(); if (!(o instanceof JSONArray)) throw new JSONException("Not a JSONArray"); list.addAll(((JSONArray) o).list); }
  public int length() { return list.size(); }
  public Object opt(int i) { return i < 0 || i >= list.size() ? null : list.get(i); }
  public boolean isNull(int i) { Object v = opt(i); return v == null || v == JSONObject.NULL; }
  public double optDouble(int i) { return optDouble(i, Double.NaN); }
  public double optDouble(int i, double d) { Double r = JSON.toDouble(opt(i)); return r != null ? r : d; }
  public int optInt(int i) { return optInt(i, 0); }
  public int optInt(int i, int d) { Integer r = JSON.toInteger(opt(i)); return r != null ? r : d; }
  public long optLong(int i, long d) { Long r = JSON.toLong(opt(i)); return r != null ? r : d; }
  public String optString(int i) { return optString(i, ""); }
  public String optString(int i, String d) { String r = JSON.toString(opt(i)); return r != null ? r : d; }
  public boolean optBoolean(int i, boolean d) { Boolean r = JSON.toBoolean(opt(i)); return r != null ? r : d; }
  public JSONObject optJSONObject(int i) { Object v = opt(i); return v instanceof JSONObject ? (JSONObject) v : null; }
  public JSONArray optJSONArray(int i) { Object v = opt(i); return v instanceof JSONArray ? (JSONArray) v : null; }
  public JSONArray put(Object v) { list.add(v); return this; }
  public JSONArray put(int v) { list.add(v); return this; }
  public JSONArray put(double v) throws JSONException { list.add(JSON.checkDouble(v)); return this; }
  public JSONArray put(boolean v) { list.add(v); return this; }
  public JSONArray put(long v) { list.add(v); return this; }
  @Override public String toString() { StringBuilder sb = new StringBuilder("["); for (int i = 0; i < list.size(); i++) { if (i > 0) sb.append(','); JSONObject.write(sb, list.get(i)); } return sb.append(']').toString(); }
}
