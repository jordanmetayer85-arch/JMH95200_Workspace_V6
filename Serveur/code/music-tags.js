const fs = require("fs");
const path = require("path");
const MAX_TAG_BYTES = 256 * 1024;
const GENRES = "Blues|Classic Rock|Country|Dance|Disco|Funk|Grunge|Hip-Hop|Jazz|Metal|New Age|Oldies|Other|Pop|R&B|Rap|Reggae|Rock|Techno|Industrial|Alternative|Ska|Death Metal|Pranks|Soundtrack|Euro-Techno|Ambient|Trip-Hop|Vocal|Jazz+Funk|Fusion|Trance|Classical|Instrumental|Acid|House|Game|Sound Clip|Gospel|Noise|AlternRock|Bass|Soul|Punk|Space|Meditative|Instrumental Pop|Instrumental Rock|Ethnic|Gothic|Darkwave|Techno-Industrial|Electronic|Pop-Folk|Eurodance|Dream|Southern Rock|Comedy|Cult|Gangsta|Top 40|Christian Rap|Pop/Funk|Jungle|Native American|Cabaret|New Wave|Psychadelic|Rave|Showtunes|Trailer|Lo-Fi|Tribal|Acid Punk|Acid Jazz|Polka|Retro|Musical|Rock & Roll|Hard Rock".split("|");

function clean(value, limit = 180) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function textFrame(bytes) {
  if (!bytes.length) return "";
  const encoding = bytes[0];
  let content = bytes.subarray(1);
  if (encoding === 0) return clean(content.toString("latin1"));
  if (encoding === 3) return clean(content.toString("utf8"));
  if (encoding !== 1 && encoding !== 2) return "";
  let bigEndian = encoding === 2;
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) { bigEndian = true; content = content.subarray(2); }
  else if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) { bigEndian = false; content = content.subarray(2); }
  if (content.length % 2) content = content.subarray(0, content.length - 1);
  if (bigEndian) { content = Buffer.from(content); content.swap16(); }
  return clean(content.toString("utf16le"));
}

function synchsafe(bytes) {
  if (bytes.length < 4 || [...bytes.subarray(0, 4)].some(value => value > 127)) return null;
  return bytes[0] * 2097152 + bytes[1] * 16384 + bytes[2] * 128 + bytes[3];
}

function normalizeGenre(value) {
  const text = clean(value, 80);
  const index = /^(?:\((\d+)\)|(\d+))$/.exec(text);
  if (!index) return text;
  return GENRES[Number(index[1] || index[2])] || "";
}

function parseMusicTags(head, tail = Buffer.alloc(0)) {
  const result = {};
  if (head.length >= 10 && head.subarray(0, 3).toString("ascii") === "ID3" && [3, 4].includes(head[3])) {
    const declared = synchsafe(head.subarray(6, 10));
    // Unsynchronised or extended headers are skipped rather than guessed.
    if (declared !== null && declared <= MAX_TAG_BYTES && head.length >= 10 + declared && !(head[5] & 0xc0)) {
      const finish = 10 + declared;
      let offset = 10;
      while (offset + 10 <= finish) {
        const name = head.subarray(offset, offset + 4).toString("ascii");
        if (!/^[A-Z0-9]{4}$/.test(name)) break;
        const size = head[3] === 4 ? synchsafe(head.subarray(offset + 4, offset + 8)) : head.readUInt32BE(offset + 4);
        if (size === null || size <= 0 || offset + 10 + size > finish) break;
        const flagged = head[3] === 4 ? (head[offset + 9] & 0x4f) : (head[offset + 9] & 0xe0);
        if (!flagged) {
          const value = textFrame(head.subarray(offset + 10, offset + 10 + size));
          const field = { TIT2: "title", TPE1: "artist", TALB: "album", TCON: "genre", TYER: "year", TDRC: "year" }[name];
          if (field && value) {
            if (field === "year") { const match = /^(\d{4})/.exec(value); if (match && Number(match[1]) >= 1888 && Number(match[1]) <= 2100) result.year = Number(match[1]); }
            else result[field] = field === "genre" ? normalizeGenre(value) : clean(value);
          }
        }
        offset += 10 + size;
      }
    }
  }
  if (tail.length === 128 && tail.subarray(0, 3).toString("ascii") === "TAG") {
    const v1 = {
      title: clean(tail.subarray(3, 33).toString("latin1")),
      artist: clean(tail.subarray(33, 63).toString("latin1")),
      album: clean(tail.subarray(63, 93).toString("latin1")),
      genre: GENRES[tail[127]] || ""
    };
    const year = Number(clean(tail.subarray(93, 97).toString("latin1")));
    if (Number.isInteger(year) && year >= 1888 && year <= 2100) v1.year = year;
    for (const [key, value] of Object.entries(v1)) if (!result[key] && value) result[key] = value;
  }
  return result;
}

async function readMusicMetadata(filePath) {
  if (path.extname(filePath).toLowerCase() !== ".mp3") return {};
  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) return {};
    const header = Buffer.alloc(10);
    const headerRead = await handle.read(header, 0, 10, 0);
    let head = header.subarray(0, headerRead.bytesRead);
    if (headerRead.bytesRead === 10 && header.subarray(0, 3).toString("ascii") === "ID3") {
      const size = synchsafe(header.subarray(6, 10));
      if (size !== null && size <= MAX_TAG_BYTES && stat.size >= size + 10) {
        const payload = Buffer.alloc(size);
        const read = await handle.read(payload, 0, size, 10);
        head = Buffer.concat([header, payload.subarray(0, read.bytesRead)]);
      }
    }
    let tail = Buffer.alloc(0);
    if (stat.size >= 128) {
      tail = Buffer.alloc(128);
      const read = await handle.read(tail, 0, 128, stat.size - 128);
      tail = tail.subarray(0, read.bytesRead);
    }
    return parseMusicTags(head, tail);
  } catch { return {}; }
  finally { if (handle) { try { await handle.close(); } catch {} } }
}

module.exports = { readMusicMetadata, parseMusicTags, MAX_TAG_BYTES };
