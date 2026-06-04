import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBRL(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  const v = Number(value ?? 0);
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return "";
  const digits = cnpj.replace(/\D/g, "").padStart(14, "0").slice(-14);
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function periodoToLabel(periodo: string): string {
  const [y, m] = periodo.split("-");
  const meses = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${meses[idx]}/${y}`;
}

export function md5(str: string): string {
  // Implementação simples de hash MD5 em TS puro (RFC 1321)
  function rotateLeft(n: number, b: number) { return (n << b) | (n >>> (32 - b)); }
  function addUnsigned(a: number, b: number) {
    const lsw = (a & 0xffff) + (b & 0xffff);
    const msw = (a >> 16) + (b >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function F(x: number, y: number, z: number) { return (x & y) | (~x & z); }
  function G(x: number, y: number, z: number) { return (x & z) | (y & ~z); }
  function H(x: number, y: number, z: number) { return x ^ y ^ z; }
  function I(x: number, y: number, z: number) { return y ^ (x | ~z); }
  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(s: string) {
    const wordCount = (((s.length + 8) >> 6) + 1) * 16;
    const arr = new Array<number>(wordCount).fill(0);
    let bytePos = 0;
    let byteCount = 0;
    while (byteCount < s.length) {
      const wordPos = (byteCount - (byteCount % 4)) / 4;
      bytePos = (byteCount % 4) * 8;
      arr[wordPos] = arr[wordPos] | (s.charCodeAt(byteCount) << bytePos);
      byteCount++;
    }
    const wordPos = (byteCount - (byteCount % 4)) / 4;
    bytePos = (byteCount % 4) * 8;
    arr[wordPos] = arr[wordPos] | (0x80 << bytePos);
    arr[wordCount - 2] = s.length << 3;
    arr[wordCount - 1] = s.length >>> 29;
    return arr;
  }
  function wordToHex(w: number) {
    let hex = "";
    for (let i = 0; i <= 3; i++) {
      const byte = (w >>> (i * 8)) & 255;
      hex += ("0" + byte.toString(16)).slice(-2);
    }
    return hex;
  }
  // UTF-8 encode
  const utf8 = unescape(encodeURIComponent(str));
  const x = convertToWordArray(utf8);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const S11=7,S12=12,S13=17,S14=22,S21=5,S22=9,S23=14,S24=20,S31=4,S32=11,S33=16,S34=23,S41=6,S42=10,S43=15,S44=21;
  for (let k = 0; k < x.length; k += 16) {
    const aa=a, bb=b, cc=c, dd=d;
    a = FF(a,b,c,d,x[k+0],S11,0xd76aa478); d = FF(d,a,b,c,x[k+1],S12,0xe8c7b756);
    c = FF(c,d,a,b,x[k+2],S13,0x242070db); b = FF(b,c,d,a,x[k+3],S14,0xc1bdceee);
    a = FF(a,b,c,d,x[k+4],S11,0xf57c0faf); d = FF(d,a,b,c,x[k+5],S12,0x4787c62a);
    c = FF(c,d,a,b,x[k+6],S13,0xa8304613); b = FF(b,c,d,a,x[k+7],S14,0xfd469501);
    a = FF(a,b,c,d,x[k+8],S11,0x698098d8); d = FF(d,a,b,c,x[k+9],S12,0x8b44f7af);
    c = FF(c,d,a,b,x[k+10],S13,0xffff5bb1); b = FF(b,c,d,a,x[k+11],S14,0x895cd7be);
    a = FF(a,b,c,d,x[k+12],S11,0x6b901122); d = FF(d,a,b,c,x[k+13],S12,0xfd987193);
    c = FF(c,d,a,b,x[k+14],S13,0xa679438e); b = FF(b,c,d,a,x[k+15],S14,0x49b40821);
    a = GG(a,b,c,d,x[k+1],S21,0xf61e2562); d = GG(d,a,b,c,x[k+6],S22,0xc040b340);
    c = GG(c,d,a,b,x[k+11],S23,0x265e5a51); b = GG(b,c,d,a,x[k+0],S24,0xe9b6c7aa);
    a = GG(a,b,c,d,x[k+5],S21,0xd62f105d); d = GG(d,a,b,c,x[k+10],S22,0x2441453);
    c = GG(c,d,a,b,x[k+15],S23,0xd8a1e681); b = GG(b,c,d,a,x[k+4],S24,0xe7d3fbc8);
    a = GG(a,b,c,d,x[k+9],S21,0x21e1cde6); d = GG(d,a,b,c,x[k+14],S22,0xc33707d6);
    c = GG(c,d,a,b,x[k+3],S23,0xf4d50d87); b = GG(b,c,d,a,x[k+8],S24,0x455a14ed);
    a = GG(a,b,c,d,x[k+13],S21,0xa9e3e905); d = GG(d,a,b,c,x[k+2],S22,0xfcefa3f8);
    c = GG(c,d,a,b,x[k+7],S23,0x676f02d9); b = GG(b,c,d,a,x[k+12],S24,0x8d2a4c8a);
    a = HH(a,b,c,d,x[k+5],S31,0xfffa3942); d = HH(d,a,b,c,x[k+8],S32,0x8771f681);
    c = HH(c,d,a,b,x[k+11],S33,0x6d9d6122); b = HH(b,c,d,a,x[k+14],S34,0xfde5380c);
    a = HH(a,b,c,d,x[k+1],S31,0xa4beea44); d = HH(d,a,b,c,x[k+4],S32,0x4bdecfa9);
    c = HH(c,d,a,b,x[k+7],S33,0xf6bb4b60); b = HH(b,c,d,a,x[k+10],S34,0xbebfbc70);
    a = HH(a,b,c,d,x[k+13],S31,0x289b7ec6); d = HH(d,a,b,c,x[k+0],S32,0xeaa127fa);
    c = HH(c,d,a,b,x[k+3],S33,0xd4ef3085); b = HH(b,c,d,a,x[k+6],S34,0x4881d05);
    a = HH(a,b,c,d,x[k+9],S31,0xd9d4d039); d = HH(d,a,b,c,x[k+12],S32,0xe6db99e5);
    c = HH(c,d,a,b,x[k+15],S33,0x1fa27cf8); b = HH(b,c,d,a,x[k+2],S34,0xc4ac5665);
    a = II(a,b,c,d,x[k+0],S41,0xf4292244); d = II(d,a,b,c,x[k+7],S42,0x432aff97);
    c = II(c,d,a,b,x[k+14],S43,0xab9423a7); b = II(b,c,d,a,x[k+5],S44,0xfc93a039);
    a = II(a,b,c,d,x[k+12],S41,0x655b59c3); d = II(d,a,b,c,x[k+3],S42,0x8f0ccc92);
    c = II(c,d,a,b,x[k+10],S43,0xffeff47d); b = II(b,c,d,a,x[k+1],S44,0x85845dd1);
    a = II(a,b,c,d,x[k+8],S41,0x6fa87e4f); d = II(d,a,b,c,x[k+15],S42,0xfe2ce6e0);
    c = II(c,d,a,b,x[k+6],S43,0xa3014314); b = II(b,c,d,a,x[k+13],S44,0x4e0811a1);
    a = II(a,b,c,d,x[k+4],S41,0xf7537e82); d = II(d,a,b,c,x[k+11],S42,0xbd3af235);
    c = II(c,d,a,b,x[k+2],S43,0x2ad7d2bb); b = II(b,c,d,a,x[k+9],S44,0xeb86d391);
    a = addUnsigned(a, aa); b = addUnsigned(b, bb); c = addUnsigned(c, cc); d = addUnsigned(d, dd);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

export function brToNumber(s: string | number | null | undefined): number {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}
