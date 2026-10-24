package org.json;
// Mirrors AOSP libcore org.json.JSON coercion helpers.
class JSON {
  static double checkDouble(double d) throws JSONException { if (Double.isInfinite(d) || Double.isNaN(d)) throw new JSONException("Forbidden numeric value: " + d); return d; }
  static Boolean toBoolean(Object v) { if (v instanceof Boolean) return (Boolean) v; if (v instanceof String) { String s = (String) v; if ("true".equalsIgnoreCase(s)) return true; if ("false".equalsIgnoreCase(s)) return false; } return null; }
  static Double toDouble(Object v) { if (v instanceof Double) return (Double) v; if (v instanceof Number) return ((Number) v).doubleValue(); if (v instanceof String) { try { return Double.valueOf((String) v); } catch (NumberFormatException e) {} } return null; }
  static Integer toInteger(Object v) { if (v instanceof Integer) return (Integer) v; if (v instanceof Number) return ((Number) v).intValue(); if (v instanceof String) { try { return (int) Double.parseDouble((String) v); } catch (NumberFormatException e) {} } return null; }
  static Long toLong(Object v) { if (v instanceof Long) return (Long) v; if (v instanceof Number) return ((Number) v).longValue(); if (v instanceof String) { try { return (long) Double.parseDouble((String) v); } catch (NumberFormatException e) {} } return null; }
  static String toString(Object v) { if (v instanceof String) return (String) v; if (v != null) return String.valueOf(v); return null; }
}
