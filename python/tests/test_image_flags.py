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

    def set_many(self, paths, **fields):
        status, body, _ = self.request("PUT", f"/folders/{self.folder_id}/flags", body={"paths": [str(p) for p in paths], **fields})
        return status, json.loads(body)

    def set_flags(self, path, **fields):
        """one image: (status, {favorite, hidden}) or (status, error body)"""
        status, body = self.set_many([path], **fields)
        if status != 200:
            return status, body
        return status, {k: body[0][k] for k in ("favorite", "hidden")}

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

    def test_many_images_at_once(self):
        status, body = self.set_many([self.a, self.b], hidden=True)
        self.assertEqual(status, 200)
        self.assertEqual([(r["path"], r["hidden"]) for r in body], [(str(self.a), True), (str(self.b), True)])
        self.assertEqual(self.playlist(), ["c.png"])
        self.set_many([self.a, self.b], hidden=False)
        self.assertEqual(self.playlist(), ["a.png", "b.png", "c.png"])

    def test_one_bad_path_changes_nothing(self):
        status, _ = self.set_many([self.a, self.secret], favorite=True)
        self.assertEqual(status, 404)
        self.assertFalse(self.folder_files()["a.png"]["favorite"])
        self.assertEqual(self.set_many([], favorite=True)[0], 422)

    def test_flags_only_for_images_inside_the_folder(self):
        self.assertEqual(self.set_flags(self.secret, hidden=True)[0], 404)
        self.assertEqual(self.set_flags(self.folder / "missing.png", hidden=True)[0], 404)
        status, _, _ = self.request("PUT", "/folders/nope/flags", body={"paths": [str(self.a)], "hidden": True})
        self.assertEqual(status, 404)
