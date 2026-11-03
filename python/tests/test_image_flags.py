"""Favorite / hidden marks on library images; hidden ones stay out of practice sessions."""

import json

from PIL import Image

from backend_case import BackendTestCase


class ImageFlagsTest(BackendTestCase):
    @classmethod
    def make_files(cls):
        cls.outside = cls.tmp / "private"
        cls.outside.mkdir()
        (cls.folder / "sub").mkdir()
        cls.a = cls.folder / "a.png"
        cls.b = cls.folder / "b.png"
        cls.c = cls.folder / "sub" / "c.png"
        cls.secret = cls.outside / "secret.png"
        for p in (cls.a, cls.b, cls.c, cls.secret):
            Image.new("RGB", (10, 10), "red").save(p)

    def set_flags(self, path, **fields):
        status, body, _ = self.request("PUT", f"/folders/{self.folder_id}/flags", body={"path": str(path), **fields})
        return status, json.loads(body)

    def folder_files(self, rel_path=""):
        status, body = self.get(f"/folders/{self.folder_id}/files?rel_path={rel_path}")
        self.assertEqual(status, 200)
        return {f["name"]: f for f in json.loads(body)}

    def playlist(self):
        status, body, _ = self.request("POST", "/folders/files", body={"items": [{"folder_id": self.folder_id, "rel_path": "", "recursive": True}]})
        self.assertEqual(status, 200)
        return [f["name"] for f in json.loads(body)]

    def test_hidden_images_leave_the_playlist_but_stay_in_the_library(self):
        self.assertEqual(self.set_flags(self.c, hidden=True), (200, {"favorite": False, "hidden": True}))
        self.assertEqual(self.playlist(), ["a.png", "b.png"])
        self.assertTrue(self.folder_files("sub")["c.png"]["hidden"])

        self.set_flags(self.c, hidden=False)
        self.assertEqual(self.playlist(), ["a.png", "b.png", "c.png"])

    def test_favorite_is_kept_separately_from_hidden(self):
        self.set_flags(self.a, favorite=True)
        self.assertEqual(self.set_flags(self.a, hidden=True)[1], {"favorite": True, "hidden": True})
        self.assertEqual(self.set_flags(self.a, hidden=False)[1], {"favorite": True, "hidden": False})
        files = self.folder_files()
        self.assertTrue(files["a.png"]["favorite"])
        self.assertFalse(files["b.png"]["favorite"])
        self.set_flags(self.a, favorite=False)
        self.assertFalse(self.folder_files()["a.png"]["favorite"])

    def test_flags_only_for_images_inside_the_folder(self):
        self.assertEqual(self.set_flags(self.secret, hidden=True)[0], 404)
        self.assertEqual(self.set_flags(self.folder / "missing.png", hidden=True)[0], 404)
        status, _, _ = self.request("PUT", "/folders/nope/flags", body={"path": str(self.a), "hidden": True})
        self.assertEqual(status, 404)
