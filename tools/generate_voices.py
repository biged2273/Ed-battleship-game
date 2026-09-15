#!/usr/bin/env python3
"""Pre-generate the smack-talk voice clips with ElevenLabs.

Run once when lines change:  ELEVENLABS_API_KEY=... python3 tools/generate_voices.py
Writes voice/*.mp3 plus voice/lines.json, which the game loads at runtime.
"""
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / "voice"
MODEL = "eleven_v3"

# Premade voices (library voices need a paid plan).
VOICES = {
    "you": "iP95p4xoKVk53GoZ742B",   # Chris - charming, down-to-earth
    "foe": "pqHfZKP75CvOlQylNhV4",   # Bill - wise, mature, older
}
STYLE = {
    "you": "[thick southern drawl, cocky, beer in hand]",
    "foe": "[thick southern drawl, gravelly old man, chuckling]",
}

LINES = {
    "youHit": [
        "Hell yeah brother!!",
        "Get off my lake, Gary!",
        "That one had your name on it, Dale!",
        "Boom goes the bait shop!",
    ],
    "youMiss": [
        "Aw, come on, that was the wind.",
        "Dang it. Hand me another beer.",
        "I meant to do that. Warning shot.",
        "Rod slipped. Not my fault.",
    ],
    "foeHit": [
        "Gary says: sit down, son!",
        "Dale says: that is how you cast!",
        "Gary says: tell your wife I said hi!",
        "Dale says: we are just getting warmed up!",
    ],
    "foeMiss": [
        "Gary says: alright, alright, I was reeling.",
        "Dale says: that one was a practice throw.",
        "Gary says: sun was in my eyes.",
        "Dale says: lucky the lake is big.",
    ],
    "youDefend": [
        "Get that outta here!",
        "Not today, Gary! Have a cold one!",
        "Beer can defense, baby!",
    ],
    "foeDefend": [
        "Gary says: get that outta here!",
        "Dale says: nice try, we got a whole cooler!",
        "Gary says: knocked it right out of the sky!",
    ],
}

DRAWL = [
    ("going to", "fixin' ta"),
    ("that is how", "that's how y'"),
    ("we are", "we're"),
    ("I was", "Ah wuz"),
    ("I meant", "Ah meant"),
    ("I said", "Ah said"),
    ("my lake", "mah lake"),
    ("outta", "outta"),
]


def spoken(text: str) -> str:
    line = text.replace("Gary says: ", "").replace("Dale says: ", "")
    for a, b in DRAWL:
        line = line.replace(a, b)
    return line


def tts(api_key: str, who: str, text: str, name: str) -> None:
    dest = OUT / f"{name}.mp3"
    if dest.exists() and dest.stat().st_size > 2000:
        return
    body = json.dumps({
        "text": f"{STYLE[who]} {spoken(text)}",
        "model_id": MODEL,
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.6},
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICES[who]}?output_format=mp3_44100_64",
        data=body,
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        dest.write_bytes(r.read())
    print(f"  {dest.name}  {dest.stat().st_size // 1024} KB")


def main() -> int:
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        print("ELEVENLABS_API_KEY is not set", file=sys.stderr)
        return 1
    OUT.mkdir(exist_ok=True)
    manifest = {}
    for kind, lines in LINES.items():
        who = "foe" if kind.startswith("foe") else "you"
        manifest[kind] = []
        for text in lines:
            slug = hashlib.sha1(f"{who}:{text}".encode()).hexdigest()[:10]
            name = f"{kind}-{slug}"
            print(f"{kind}: {text}")
            try:
                tts(api_key, who, text, name)
            except urllib.error.HTTPError as e:
                print(f"  failed ({e.code}): {e.read()[:200]!r}", file=sys.stderr)
                continue
            manifest[kind].append({"text": text, "clip": f"{name}.mp3"})
    (OUT / "lines.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
