import importlib.util
import json
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import warnings
import zipfile


SPEC = importlib.util.spec_from_file_location("pages_archive", Path(__file__).with_name("pages_archive.py"))
pages = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages)


def manifest(kind="production", **overrides):
    value = {"schema": 1, "kind": kind, "sourceSha": "a" * 40, "runId": 12345,
             "runAttempt": 2, "basePath": "/ksp-deltav/"}
    if kind == "preview":
        value.update(prNumber=24, mergeSha="b" * 40, baseSha="c" * 40,
                     basePath="/ksp-deltav/previews/pr-24/")
    value.update(overrides)
    return value


def html(number=24, *, robots="noindex, nofollow, noarchive", script="'self'", connect="'none'", extra=""):
    return f'''<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src {script}; connect-src {connect}; {extra}">
<meta name="robots" content="{robots}"><meta name="ksp-preview-pr" content="{number}">
<script type="module" src="/ksp-deltav/previews/pr-{number}/assets/app.js"></script>
</head><body><div id="root"></div></body></html>'''


class ArtifactExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.archive = self.root / "artifact.zip"
        self.destination = self.root / "extracted"

    def tearDown(self):
        self.temporary.cleanup()

    def write_archive(self, *, metadata=None, entries=(), index=None, raw_manifest=None, compression=zipfile.ZIP_DEFLATED):
        metadata = metadata if metadata is not None else manifest()
        if index is None:
            index = html(metadata.get("prNumber", 24)) if metadata.get("kind") == "preview" else "<html><head></head><body>Production</body></html>"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.archive, "w", compression=compression) as archive:
                archive.writestr("build.json", raw_manifest if raw_manifest is not None else json.dumps(metadata))
                archive.writestr("site/index.html", index)
                for path, content in entries:
                    archive.writestr(path, content)

    def reject(self, **limits):
        with self.assertRaises(pages.ArtifactError):
            pages.extract_artifact(self.archive, self.destination, **limits)
        self.assertFalse(self.destination.exists())
        self.assertEqual(sorted(path.name for path in self.root.iterdir()), ["artifact.zip"])

    def test_extracts_production_and_preserves_binary_assets_as_regular_data(self):
        self.write_archive(entries=[("site/assets/app.js", "window.app = true"),
                                    ("site/assets/font.woff2", b"\x00\xff\x01"), ("site/assets/", "")])
        result = pages.extract_artifact(self.archive, self.destination)
        self.assertEqual(result, manifest())
        self.assertEqual((self.destination / "site/assets/font.woff2").read_bytes(), b"\x00\xff\x01")
        self.assertEqual(stat.S_IMODE((self.destination / "site/assets/app.js").stat().st_mode), 0o644)
        self.assertEqual((self.destination / "site/index.html").read_text(), "<html><head></head><body>Production</body></html>")

    def test_extracts_a_protected_preview_with_exact_identity(self):
        self.write_archive(metadata=manifest("preview"), entries=[("site/assets/app.js", "/* preview */")])
        self.assertEqual(pages.extract_artifact(self.archive, self.destination), manifest("preview"))
        self.assertIn("noindex", (self.destination / "site/index.html").read_text())

    def test_accepts_an_existing_empty_destination(self):
        self.destination.mkdir()
        self.write_archive()
        pages.extract_artifact(self.archive, self.destination)
        self.assertTrue((self.destination / "build.json").is_file())

    def test_does_not_modify_existing_data_or_follow_destination_symlinks(self):
        self.write_archive()
        self.destination.mkdir()
        sentinel = self.destination / "keep.txt"
        sentinel.write_text("keep")
        with self.assertRaises(pages.ArtifactError):
            pages.extract_artifact(self.archive, self.destination)
        self.assertEqual(sentinel.read_text(), "keep")
        sentinel.unlink()
        self.destination.rmdir()
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        self.destination.symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaises(pages.ArtifactError):
            pages.extract_artifact(self.archive, self.destination)
        self.assertEqual(list(elsewhere.iterdir()), [])

    def test_rejects_traversal_absolute_windows_and_ambiguous_paths(self):
        for path in ["../escape", "/tmp/escape", "C:/escape", "site/../escape", "site/./asset", "site//asset",
                     "site/asset\\escape", "site/file:stream", "site/trailing. ", "site/line\nname", "other/index.html"]:
            with self.subTest(path=path):
                self.write_archive(entries=[(path, "bad")])
                self.reject()

    def test_rejects_nul_even_when_zipfile_truncates_the_display_name(self):
        self.write_archive(entries=[("site/asset.txt", "bad")])
        data = self.archive.read_bytes().replace(b"site/asset.txt", b"site/asset\x00txt")
        self.archive.write_bytes(data)
        self.reject()

    def test_rejects_reserved_paths_in_any_site_directory_and_case(self):
        for name in [".git", ".GITHUB", ".gitignore", ".gitattributes", ".gitmodules", ".gitconfig",
                     ".pages-state.json", "CNAME", "previews"]:
            with self.subTest(name=name):
                self.write_archive(entries=[(f"site/assets/{name}/payload", "bad")])
                self.reject()

    def test_rejects_duplicate_case_and_unicode_aliases(self):
        for entries in [[("site/index.html", "duplicate")],
                        [("site/Assets/app.js", "a"), ("site/assets/other.js", "b")],
                        [("site/aé.txt", "a"), ("site/ae\u0301.txt", "b")],
                        [("site/assets/app.js", "a"), ("site/assets/APP.js", "b")]]:
            with self.subTest(entries=entries):
                self.write_archive(entries=entries)
                self.reject()

    def test_rejects_file_directory_conflicts_in_either_order(self):
        for entries in [[("site/assets", "a"), ("site/assets/app.js", "b")],
                        [("site/assets/app.js", "b"), ("site/assets", "a")],
                        [("site/empty/", "contains data")]]:
            with self.subTest(entries=entries):
                self.write_archive(entries=entries)
                self.reject()

    def test_rejects_symlinks_and_special_files(self):
        for kind in [stat.S_IFLNK, stat.S_IFIFO, stat.S_IFCHR, stat.S_IFBLK, stat.S_IFSOCK]:
            with self.subTest(kind=kind):
                info = zipfile.ZipInfo("site/assets/linked")
                info.create_system = 3
                info.external_attr = (kind | 0o777) << 16
                self.write_archive(entries=[(info, "../../outside")])
                self.reject()

    def test_rejects_hardlink_metadata_even_with_regular_file_mode(self):
        for identifier in [0x000D, 0x756E]:
            with self.subTest(identifier=identifier):
                info = zipfile.ZipInfo("site/assets/linked")
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                payload = b"\x00" * 12 + b"../../outside"
                info.extra = struct.pack("<HH", identifier, len(payload)) + payload
                self.write_archive(entries=[(info, "not executed")])
                self.reject()

    def test_rejects_encrypted_flags_and_unsupported_compression(self):
        self.write_archive()
        data = bytearray(self.archive.read_bytes())
        central = data.index(b"PK\x01\x02")
        struct.pack_into("<H", data, central + 8, 1)
        self.archive.write_bytes(data)
        self.reject()
        self.write_archive(compression=zipfile.ZIP_BZIP2)
        self.reject()

    def test_bounds_file_count_before_zipfile_allocates_entry_metadata(self):
        self.write_archive(entries=[("site/assets/a", "a")])
        with mock.patch.object(pages.zipfile, "ZipFile", side_effect=AssertionError("must reject before allocating")):
            self.reject(max_files=2)

    def test_checks_actual_records_instead_of_a_forged_directory_count(self):
        self.write_archive(entries=[("site/assets/a", "a")])
        data = bytearray(self.archive.read_bytes())
        end = data.rindex(b"PK\x05\x06")
        struct.pack_into("<HH", data, end + 8, 1, 1)
        self.archive.write_bytes(data)
        self.reject()

    def test_bounds_compressed_and_uncompressed_sizes(self):
        self.write_archive()
        self.reject(max_bytes=10)
        self.write_archive(entries=[("site/assets/large", b"0" * 5000)])
        self.assertLess(self.archive.stat().st_size, 2000)
        self.reject(max_bytes=2000)

    def test_cleans_partial_files_after_a_crc_failure(self):
        self.write_archive(entries=[("site/assets/keep", "first file"), ("site/assets/broken", "123456")],
                           compression=zipfile.ZIP_STORED)
        with zipfile.ZipFile(self.archive) as archive:
            entry = archive.getinfo("site/assets/broken")
        data = bytearray(self.archive.read_bytes())
        position = entry.header_offset + 30 + len(entry.filename.encode()) + len(entry.extra)
        data[position] ^= 1
        self.archive.write_bytes(data)
        self.reject()

    def test_rejects_bad_manifest_schema_identity_and_units(self):
        cases = [manifest(schema=False), manifest(schema=2), manifest(kind={}), manifest(sourceSha="a" * 7),
                 manifest(runId=True), manifest(runAttempt="1"), manifest(runId=2**53),
                 manifest(basePath="/ksp-deltav/previews/pr-24/"), manifest("preview", prNumber=0),
                 manifest("preview", prNumber=24.0), manifest("preview", basePath="/ksp-deltav/"),
                 manifest("preview", mergeSha="bad"), manifest("preview", baseSha="x" * 40)]
        for metadata in cases:
            with self.subTest(metadata=metadata):
                self.write_archive(metadata=metadata)
                self.reject()

    def test_rejects_duplicate_json_keys_nonfinite_numbers_and_huge_manifests(self):
        for value in [b'{"schema":1,"schema":1}', b'{"schema":NaN}', b'\xff', b'[]',
                      json.dumps(manifest(padding="x" * (pages.MAX_MANIFEST_BYTES + 1))).encode()]:
            with self.subTest(value=value[:30]):
                self.write_archive(raw_manifest=value)
                self.reject()

    def test_rejects_missing_manifest_and_index(self):
        for missing in ["build.json", "site/index.html"]:
            with self.subTest(missing=missing):
                with zipfile.ZipFile(self.archive, "w") as archive:
                    if missing != "build.json":
                        archive.writestr("build.json", json.dumps(manifest()))
                    if missing != "site/index.html":
                        archive.writestr("site/index.html", "production")
                self.reject()

    def test_preview_requires_matching_html_identity_noindex_and_strict_csp(self):
        for index in [html(number=25), html(robots="index, follow"), html(robots="noindex, index"),
                      html(script="'self' https:"), html(connect="'self'"), html(extra="script-src-elem https:"),
                      html().replace('name="ksp-preview-pr"', 'name="other"'),
                      html().replace("<head>", '<head><script src="https://external.test/early.js"></script>'),
                      html().replace("<head>", "<body>").replace("</head>", "</body>")]:
            with self.subTest(index=index):
                self.write_archive(metadata=manifest("preview"), index=index)
                self.reject()

    def test_csp_uses_first_duplicate_directive_as_browsers_do(self):
        self.write_archive(metadata=manifest("preview"), index=html(connect="'self'", extra="connect-src 'none'"))
        self.reject()

    def test_cli_prints_manifest_json_and_reports_validation_errors_without_traceback(self):
        self.write_archive(metadata=manifest("preview"))
        script = Path(__file__).with_name("pages_archive.py")
        result = subprocess.run([sys.executable, str(script), str(self.archive), str(self.destination)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), manifest("preview"))
        result = subprocess.run([sys.executable, str(script), str(self.archive), str(self.destination)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Artifact rejected:", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
