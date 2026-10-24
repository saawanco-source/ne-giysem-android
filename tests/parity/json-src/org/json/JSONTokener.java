package org.json;
public class JSONTokener {
  private final String in; private int pos;
  public JSONTokener(String in) { if (in != null && in.startsWith("﻿")) in = in.substring(1); this.in = in; }
  private int nextClean() { while (pos < in.length()) { char c = in.charAt(pos++); if (c == ' ' || c == '\t' || c == '\n' || c == '\r') continue; return c; } return -1; }
  public Object nextValue() throws JSONException {
    int c = nextClean();
    switch (c) {
      case -1: throw new JSONException("End of input");
      case '{': return readObject();
      case '[': return readArray();
      case '"': case '\'': return nextString((char) c);
      default: pos--; return readLiteral();
    }
  }
  private String nextString(char q) throws JSONException {
    StringBuilder sb = new StringBuilder();
    while (pos < in.length()) { char c = in.charAt(pos++);
      if (c == q) return sb.toString();
      if (c == '\\') { char e = in.charAt(pos++);
        switch (e) { case 'u': sb.append((char) Integer.parseInt(in.substring(pos, pos + 4), 16)); pos += 4; break; case 't': sb.append('\t'); break; case 'b': sb.append('\b'); break; case 'n': sb.append('\n'); break; case 'r': sb.append('\r'); break; case 'f': sb.append('\f'); break; default: sb.append(e); }
      } else sb.append(c); }
    throw new JSONException("Unterminated string");
  }
  private Object readLiteral() throws JSONException {
    int start = pos; while (pos < in.length() && ",:]} \t\n\r{[/;#=".indexOf(in.charAt(pos)) < 0) pos++;
    String lit = in.substring(start, pos);
    if (lit.isEmpty()) throw new JSONException("Expected literal value");
    if ("null".equalsIgnoreCase(lit)) return JSONObject.NULL;
    if ("true".equalsIgnoreCase(lit)) return Boolean.TRUE;
    if ("false".equalsIgnoreCase(lit)) return Boolean.FALSE;
    if (lit.indexOf('.') == -1 && lit.indexOf('e') == -1 && lit.indexOf('E') == -1) {
      try { long l = Long.parseLong(lit); if (l <= Integer.MAX_VALUE && l >= Integer.MIN_VALUE) return (int) l; return l; } catch (NumberFormatException e) {}
    }
    try { return Double.valueOf(lit); } catch (NumberFormatException e) {}
    return lit;
  }
  private JSONObject readObject() throws JSONException {
    JSONObject o = new JSONObject();
    int c = nextClean(); if (c == '}') return o; pos--;
    while (true) {
      Object name = nextValue(); if (!(name instanceof String)) throw new JSONException("Names must be strings");
      int sep = nextClean(); if (sep != ':' && sep != '=') throw new JSONException("Expected ':'");
      o.map.put((String) name, nextValue());
      c = nextClean(); if (c == '}') return o; if (c != ',' && c != ';') throw new JSONException("Unterminated object");
    }
  }
  private JSONArray readArray() throws JSONException {
    JSONArray a = new JSONArray();
    int c = nextClean(); if (c == ']') return a; pos--;
    while (true) {
      a.list.add(nextValue());
      c = nextClean(); if (c == ']') return a; if (c != ',' && c != ';') throw new JSONException("Unterminated array");
    }
  }
}
