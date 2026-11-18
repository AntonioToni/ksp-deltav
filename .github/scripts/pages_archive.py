#!/usr/bin/env python3
"""Validate and extract a Pages build artifact as data, never as executable code.

The caller must independently verify the GitHub run, repository and PR identity.
An archive's manifest cannot establish its own provenance.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import sys
import tempfile
from html.parser import HTMLParser
import unicodedata
import zipfile
import zlib


MAX_BYTES = 150 * 1024 * 1024
MAX_FILES = 10_000
MAX_MANIFEST_BYTES = 64 * 1024
MAX_INDEX_BYTES = 2 * 1024 * 1024
MAX_SAFE_INTEGER = 2**53 - 1
RESERVED = {".git", ".github", ".pages-state.json", "cname", "previews"}


class ArtifactError(ValueError):
    """The downloaded artifact is unsafe or does not match the build contract."""


def _positive_integer(value: object) -> bool:
    return type(value) is int and 0 < value <= MAX_SAFE_INTEGER


def _json_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ArtifactError("Duplicate JSON manifest key.")
        result[key] = value
    return result


def _manifest(data: bytes) -> dict:
    if len(data) > MAX_MANIFEST_BYTES:
        raise ArtifactError("Build manifest is too large.")
    try:
        manifest = json.loads(data, object_pairs_hook=_json_object,
                              parse_constant=lambda _: (_ for _ in ()).throw(ArtifactError("Non-finite JSON value.")))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ArtifactError("Build manifest must be valid UTF-8 JSON.") from error
    if not isinstance(manifest, dict) or type(manifest.get("schema")) is not int or manifest["schema"] != 1:
        raise ArtifactError("Unsupported build manifest schema.")
    if not isinstance(manifest.get("kind"), str) or manifest["kind"] not in {"production", "preview"}:
        raise ArtifactError("Unsupported build kind.")
    if not isinstance(manifest.get("sourceSha"), str) or not re.fullmatch(r"[0-9a-f]{40}", manifest["sourceSha"]):
        raise ArtifactError("Build manifest needs a full source SHA.")
    if not all(_positive_integer(manifest.get(key)) for key in ("runId", "runAttempt")):
        raise ArtifactError("Build manifest needs positive safe-integer run and attempt IDs.")
    if manifest["kind"] == "preview":
        if not _positive_integer(manifest.get("prNumber")):
            raise ArtifactError("Preview manifest needs a positive PR number.")
        if any(not isinstance(manifest.get(key), str) or not re.fullmatch(r"[0-9a-f]{40}", manifest[key])
               for key in ("mergeSha", "baseSha")):
            raise ArtifactError("Preview manifest needs full merge and base SHAs.")
        expected_base = f'/ksp-deltav/previews/pr-{manifest["prNumber"]}/'
    else:
        expected_base = "/ksp-deltav/"
    if manifest.get("basePath") != expected_base:
        raise ArtifactError("Build base path does not match its deployment identity.")
    return manifest


def _extra_fields(data: bytes) -> None:
    cursor = 0
    while cursor < len(data):
        if len(data) - cursor < 4:
            raise ArtifactError("Malformed ZIP extra field.")
        identifier, length = struct.unpack_from("<HH", data, cursor)
        cursor += 4
        if cursor + length > len(data):
            raise ArtifactError("Truncated ZIP extra field.")
        # PKWARE and ASi UNIX extensions can encode link targets independently
        # of the external mode bits. They are unnecessary for ordinary assets.
        if identifier in {0x000D, 0x756E}:
            raise ArtifactError("ZIP link/UNIX metadata is not supported.")
        cursor += length


def _path(info: zipfile.ZipInfo) -> tuple[str, ...]:
    original = info.orig_filename
    if original != info.filename or any(ord(character) < 32 for character in original):
        raise ArtifactError("ZIP names cannot contain NUL or control characters.")
    if not original or original.startswith("/") or "\\" in original or ":" in original:
        raise ArtifactError(f"Unsafe ZIP path: {original!r}")
    name = original[:-1] if original.endswith("/") else original
    parts = tuple(name.split("/"))
    if any(not part or part in {".", ".."} or part.endswith((" ", "."))
           or len(part.encode("utf-8")) > 255 for part in parts) or len(name.encode("utf-8")) > 4096:
        raise ArtifactError(f"Unsafe ZIP path: {original!r}")
    if parts == ("build.json",):
        if info.is_dir():
            raise ArtifactError("build.json must be a regular file.")
    elif parts[0] != "site" or len(parts) == 1 and not info.is_dir():
        raise ArtifactError("Artifact must contain only build.json and site/.")
    if parts[0] == "site" and any(unicodedata.normalize("NFC", part).casefold() in RESERVED
                                   or unicodedata.normalize("NFC", part).casefold().startswith(".git") for part in parts[1:]):
        raise ArtifactError(f"Reserved deployment path: {original!r}")
    return parts


class _PreviewHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.robots = []
        self.preview_numbers = []
        self.policies = []
        self.resource_seen = False

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        attrs = {name.casefold(): value or "" for name, value in attributes}
        if tag == "head":
            self.in_head = True
        if tag == "meta" and self.in_head:
            name = attrs.get("name", "").casefold()
            if name == "robots":
                self.robots.extend(re.split(r"[\s,]+", attrs.get("content", "").casefold()))
            if name == "ksp-preview-pr":
                self.preview_numbers.append(attrs.get("content", ""))
            if attrs.get("http-equiv", "").casefold() == "content-security-policy":
                if self.resource_seen:
                    raise ArtifactError("Preview CSP must precede resources.")
                policy = {}
                for part in attrs.get("content", "").split(";"):
                    tokens = part.strip().split()
                    if tokens:
                        policy.setdefault(tokens[0].casefold(), tokens[1:])
                self.policies.append(policy)
        if tag in {"script", "img", "iframe", "base", "video", "audio", "source", "object", "embed"} \
                or tag == "link" and attrs.get("rel", "").casefold() != "canonical":
            self.resource_seen = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self.in_head = False


def _preview_html(index: Path, number: int) -> None:
    if index.stat().st_size > MAX_INDEX_BYTES:
        raise ArtifactError("Preview index is too large.")
    try:
        parser = _PreviewHTML()
        parser.feed(index.read_text(encoding="utf-8"))
    except UnicodeDecodeError as error:
        raise ArtifactError("Preview index must be UTF-8 HTML.") from error
    if "noindex" not in parser.robots or any(token in {"index", "all"} for token in parser.robots):
        raise ArtifactError("Preview index must prohibit search indexing.")
    if parser.preview_numbers != [str(number)]:
        raise ArtifactError("Preview HTML identity does not match the PR.")
    if not any(policy.get("connect-src") == ["'none'"] and policy.get("script-src") == ["'self'"]
               and policy.get("script-src-elem", ["'self'"]) == ["'self'"]
               and policy.get("script-src-attr", ["'none'"]) == ["'none'"] for policy in parser.policies):
        raise ArtifactError("Preview index needs the restrictive script/connect CSP.")


def _bounded_directory(archive_path: Path, max_files: int) -> None:
    """Count actual central records before ZipFile allocates metadata for them.

    The small Pages contract needs neither multipart nor ZIP64 archives. Check
    real records rather than trusting a forged EOCD entry count.
    """
    size = archive_path.stat().st_size
    with archive_path.open("rb") as source:
        tail_start = max(0, size - 65_557)
        source.seek(tail_start)
        tail = source.read()
        offset = tail.rfind(b"PK\x05\x06")
        if offset < 0 or len(tail) - offset < 22:
            raise ArtifactError("ZIP end record is missing.")
        disk, directory_disk, disk_count, count, directory_size, directory_start, comment_size = struct.unpack_from("<4H2LH", tail, offset + 4)
        if disk or directory_disk or disk_count != count or count == 0xFFFF or directory_size == 0xFFFFFFFF or directory_start == 0xFFFFFFFF:
            raise ArtifactError("Multipart and ZIP64 artifacts are not supported.")
        end_record = tail_start + offset
        if end_record + 22 + comment_size != size or directory_start + directory_size != end_record:
            raise ArtifactError("Inconsistent ZIP directory bounds.")
        source.seek(directory_start)
        consumed = 0
        actual_count = 0
        while consumed < directory_size:
            header = source.read(46)
            if len(header) != 46 or header[:4] != b"PK\x01\x02":
                raise ArtifactError("Malformed ZIP central directory.")
            name_size, extra_size, entry_comment_size = struct.unpack_from("<3H", header, 28)
            entry_size = 46 + name_size + extra_size + entry_comment_size
            actual_count += 1
            if actual_count > max_files or count > max_files:
                raise ArtifactError("Artifact exceeds the file-count limit.")
            if name_size > 4097 or consumed + entry_size > directory_size:
                raise ArtifactError("ZIP directory entry exceeds its bounds.")
            consumed += entry_size
            source.seek(entry_size - 46, 1)
        if actual_count != count:
            raise ArtifactError("ZIP directory entry count does not match its records.")


def extract_artifact(zip_path: str | Path, destination: str | Path, *, max_bytes: int = MAX_BYTES,
                     max_files: int = MAX_FILES) -> dict:
    """Atomically extract a bounded regular-file artifact into a new/empty path."""
    if not _positive_integer(max_bytes) or not _positive_integer(max_files):
        raise ArtifactError("Extraction limits must be positive safe integers.")
    archive_path = Path(zip_path)
    target = Path(destination)
    if target.is_symlink() or target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise ArtifactError("Extraction destination must be new or an empty directory.")
    if not archive_path.is_file() or archive_path.stat().st_size > max_bytes:
        raise ArtifactError("Compressed artifact is missing or exceeds the size limit.")
    _bounded_directory(archive_path, max_files)
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{target.name}-", dir=target.parent))
    try:
        with zipfile.ZipFile(archive_path) as archive:
            entries = archive.infolist()
            if len(entries) > max_files:
                raise ArtifactError("Artifact exceeds the file-count limit.")
            total = 0
            nodes = {}
            plan = []
            for info in entries:
                parts = _path(info)
                mode = info.external_attr >> 16
                kind = stat.S_IFMT(mode)
                if info.flag_bits & (0x1 | 0x40) or info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                    raise ArtifactError("Encrypted or unsupported ZIP entries are not allowed.")
                if kind not in {0, stat.S_IFDIR if info.is_dir() else stat.S_IFREG} or info.external_attr & 0x400 \
                        or info.external_attr & 0x10 and not info.is_dir():
                    raise ArtifactError("Only regular files and directories may be extracted.")
                _extra_fields(info.extra)
                for length in range(1, len(parts) + 1):
                    path = "/".join(parts[:length])
                    key = unicodedata.normalize("NFC", path).casefold()
                    is_directory = length < len(parts) or info.is_dir()
                    previous = nodes.get(key)
                    explicit = length == len(parts)
                    if previous:
                        if previous[0] != path or previous[1] != is_directory or explicit and previous[2]:
                            raise ArtifactError("Duplicate, aliased or conflicting ZIP paths.")
                        if explicit:
                            nodes[key] = (path, is_directory, True)
                    else:
                        nodes[key] = (path, is_directory, explicit)
                if info.is_dir():
                    if info.file_size:
                        raise ArtifactError("Directory entries cannot contain data.")
                else:
                    total += info.file_size
                    if total > max_bytes:
                        raise ArtifactError("Uncompressed artifact exceeds the size limit.")
                plan.append((info, parts))
            for info, parts in plan:
                output = staging.joinpath(*parts)
                if info.is_dir():
                    output.mkdir(parents=True, exist_ok=True)
                    continue
                output.parent.mkdir(parents=True, exist_ok=True)
                remaining = info.file_size
                with archive.open(info) as source, output.open("xb") as sink:
                    while data := source.read(min(1024 * 1024, remaining + 1)):
                        remaining -= len(data)
                        if remaining < 0:
                            raise ArtifactError("ZIP entry exceeded its declared size.")
                        sink.write(data)
                if remaining:
                    raise ArtifactError("ZIP entry was truncated.")
                output.chmod(0o644)
        manifest_path = staging / "build.json"
        if not manifest_path.is_file() or not (staging / "site" / "index.html").is_file():
            raise ArtifactError("Artifact needs build.json and site/index.html.")
        manifest = _manifest(manifest_path.read_bytes())
        if manifest["kind"] == "preview":
            _preview_html(staging / "site" / "index.html", manifest["prNumber"])
        os.replace(staging, target)
        return manifest
    except (OSError, UnicodeError, zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, zlib.error, NotImplementedError) as error:
        raise ArtifactError(f"Artifact extraction failed: {error}") from error
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: pages_archive.py ARTIFACT.zip DESTINATION", file=sys.stderr)
        sys.exit(2)
    try:
        print(json.dumps(extract_artifact(sys.argv[1], sys.argv[2]), separators=(",", ":")))
    except (ArtifactError, ValueError) as error:
        print(f"Artifact rejected: {error}", file=sys.stderr)
        sys.exit(1)
