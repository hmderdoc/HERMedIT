# Synchronet editor contract

This document records the contract observed in the current local Synchronet
source. It should drive adapter tests. It is more authoritative for this board
than assumptions based on a single editor script.

## Session lifecycle

1. Synchronet chooses the configured external editor and determines a message
   temp filename.
2. It may create reply text in the node directory's `QUOTES.TXT`.
3. It removes a stale `RESULT.ED` and writes editor metadata in `EDITOR.INF` or
   `MSGINF`, according to the configured editor type.
4. It launches the configured command, expanding `%f` to the temp message path.
5. The editor reads metadata, quotes/source content, and session character set.
6. On save, the editor writes the complete message body to the passed temp path,
   optionally writes `RESULT.ED`, restores terminal state, and returns success.
7. On abort, it returns non-zero and must not present a changed temp file as a
   successful edit.
8. Synchronet accepts the edit only if the process succeeded, the temp file
   exists, the user remains online, and quoted input was actually changed.
9. Synchronet reads the temp file, processes line endings/soft CR/Ctrl-A policy,
   and stores editor, charset, and optionally terminal-column metadata.

Relevant host locations: `writemsg.cpp:36-59`, `writemsg.cpp:590-704`, and
`writemsg.cpp:813-887`.

## Filenames

| File | Default location | Purpose |
| --- | --- | --- |
| `INPUT.MSG` | system temp directory | Normal message body path passed through `%f` |
| `MSGTMP` | node directory | QuickBBS-style alternative body path |
| `QUOTES.TXT` | node directory | Reply source prepared by Synchronet |
| `EDITOR.INF` | node directory | WWIV-style metadata |
| `MSGINF` | node directory | QuickBBS-style metadata |
| `RESULT.ED` | node directory | Optional edited subject and editor details |

The `XTRN_LWRCASE` option changes the drop-file names to lower case. Code should
use case-aware lookup rather than assume one spelling. The body path supplied in
`argv[0]` is authoritative; the `INPUT.MSG` fallback is only useful for manual
or compatible invocation.

## Metadata formats

### `EDITOR.INF`

The current host writes six CRLF-terminated lines:

| Line | Value |
| ---: | --- |
| 1 | Subject |
| 2 | To |
| 3 | Current user number |
| 4 | From, or the configured Anonymous label |
| 5 | User alias/name |
| 6 | Security level |

This file does not declare the body encoding. The editor must get that from its
configured profile/session capabilities.

### `MSGINF`

The QuickBBS-style file written by Synchronet has eight CRLF-terminated lines:

| Line | Value |
| ---: | --- |
| 1 | From |
| 2 | To |
| 3 | Subject |
| 4 | `1` |
| 5 | Message area, `NetMail`, or `Electronic Mail` |
| 6 | `YES` or `NO` for private |
| 7 | Optional tagline filename (Synchronet extension) |
| 8 | `UTF-8` or `CP437` |

SlyEdit is the primary local implementation reference for this variant.

### `RESULT.ED`

Synchronet reads up to three lines:

| Line | Meaning |
| ---: | --- |
| 1 | Compatibility/status placeholder; current host does not use its contents |
| 2 | Updated subject, ignored if empty or subject is read-only |
| 3 | Editor detail string stored with the message when available |

FSEditor writes `0`, the subject, and its name/version. The editor should create
this file only as part of a successful save and should use CRLF for compatibility.

## Body semantics

### Line endings and paragraphs

- Write CRLF at the adapter boundary.
- Internally distinguish a hard paragraph break from a visual line created by
  wrapping. FSEditor's `hardcr` distinction is the minimum viable precedent.
- Do not persist viewport-only wraps as semantic paragraph breaks unless the
  selected target requires fixed rows.
- Synchronet can expand bare LF and expand, strip, or retain FidoNet soft CR
  (`0x8d`) according to the editor profile.
- Soft CR processing is deliberately disabled for UTF-8 editor sessions because
  `0x8d` may occur within a multibyte sequence.

### Message colors

Synchronet message color is represented with Ctrl-A attribute codes. The host
validates dangerous or invalid Ctrl-A sequences before storage. A compliant
message codec should:

- generate only known-safe attribute changes;
- avoid raw ANSI cursor movement, clear-screen, or positioning sequences in a
  posted body;
- retain style spans internally and emit the minimum required Ctrl-A changes;
- reset/normalize style predictably at line or message boundaries;
- test quoted input with and without `KEEP_CTRL_A`.

`KEEP_CTRL_A` affects whether existing quote colors reach the editor. It is not
permission to emit arbitrary control sequences.

### Quote input

The host may strip or retain Ctrl-A from quote text, convert between CP437 and
UTF-8, and word-wrap it before the editor starts. Default quote wrapping is
`terminal columns - 1`; a configured `quotewrap_cols` can override it.

WWIV-style quote input may begin with `#` and two metadata lines. The first
Synchronet-only implementation need not enable WWIV drop-file mode, but the
parser should fail clearly rather than post those lines as message text.

## Encoding contract

The editor needs three explicit representations:

1. **Semantic document:** Unicode prose; art cells store CP437 glyph identity
   (`0..255`) plus a normalized attribute.
2. **Terminal display:** the host renderer maps semantic values to what the
   caller's terminal can display.
3. **File transport:** the message adapter encodes actual CP437 bytes or actual
   UTF-8 bytes according to the configured editor session.

Do not determine a file's encoding by checking only whether a JS string happens
to contain values above 127. Do not assume that rendering a CP437 byte correctly
on a UTF-8 terminal proves the saved file is UTF-8.

Required tests include:

- ASCII-only text in both profiles;
- CP437 box characters saved as CP437;
- those same glyphs saved as valid UTF-8;
- mixed prose and block characters;
- subject conversion in both directions;
- malformed UTF-8 input and a non-destructive error path;
- byte `0x8d` in CP437 versus a UTF-8 multibyte sequence;
- Ctrl-A style changes adjacent to non-ASCII glyphs.

## Terminal-state contract

The editor will temporarily change mouse reporting, cursor visibility/shape,
colors, passthrough flags, and possibly control-key handling. Every exit path
must restore the prior state:

- successful save;
- explicit abort;
- thrown exception;
- disconnect/timeout;
- terminal resize where supported.

Use exit handlers as a backstop, not as the only cleanup path. Mouse must remain
optional and the keyboard path must be complete.

## Reference configurations

The checked-in configuration currently registers:

```ini
[editor:FSEDITOR]
    name=Deuce's FSEditor
    cmd=?fseditor %f
    settings=0xe06800
    ars=ANSI
    type=0
    soft_cr=3
    quotewrap_cols=0

[editor:SLYEDIT]
    name=SlyEdit
    cmd=?slyedit %f
    settings=0x10e01c00
    ars=ANSI AND COLS 80
    type=0
    soft_cr=1
    quotewrap_cols=0
```

FSEditor's bitmask enables LF expansion, quote-none, native execution, quote
wrapping, saved columns, and UTF-8 support. SlyEdit additionally uses a different
quote policy/drop-file style and retains Ctrl-A in quotes.

For HERMedIT, configure through SCFG rather than copying a hexadecimal mask.
The initial profile should deliberately choose:

- ANSI plus a minimum practical terminal size;
- Synchronet-native JS execution;
- UTF-8 support only after the UTF-8 body tests pass;
- save/share terminal columns;
- quote wrapping at zero/default (`term width - 1`);
- an explicit quote policy;
- an explicit soft-CR policy;
- whether colored quote input is worth enabling.

## Compliance test matrix

The Synchronet adapter is not complete until these black-box cases pass:

| Case | Expected result |
| --- | --- |
| New message, ASCII, save | Temp body exists, CRLF is correct, exit is success |
| New message, abort | Non-zero result; host does not accept body |
| Reply with `QUOTES.TXT` | Quote is available but not automatically mistaken for authored body |
| Subject edit | Line 2 of `RESULT.ED` updates an editable subject |
| Read-only subject | Body saves; host ignores attempted subject change |
| CP437 session | Box glyph bytes round-trip exactly |
| UTF-8 session | Body is valid UTF-8 and displays the same glyphs |
| Colored message | Only valid Ctrl-A attributes are emitted; no raw screen-control ANSI |
| Narrow/wide terminal | Safe width and stored column metadata match the session policy |
| Mouse unavailable | All save/edit/abort functions remain keyboard accessible |
| Disconnect/exception | Terminal modes are restored and edit is not falsely accepted |
| Quoted body left unchanged | Host rejects the edit as expected |
| Existing draft/source | Load, edit, and save preserve hard paragraph breaks |
| Empty body | Behavior is explicit and matches board policy |

Unit tests should cover the codecs and parser. At least one integration harness
must create real drop files, invoke the adapter, and verify the bytes it leaves
for `writemsg.cpp`.
