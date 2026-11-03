"""Sequences: grouped stills play as one item in the practice playlist."""

import json

from PIL import Image

from backend_case import BackendTestCase


class SequencesTest(BackendTestCase):
    @classmethod
    def make_files(cls):
        cls.outside = cls.tmp / "private"
        cls.outside.mkdir()
        cls.p = {n: cls.folder / f"{n}.png" for n in ("a", "b", "c", "d", "e")}
        for path in cls.p.values():
            Image.new("RGB", (10, 10), "red").save(path)
        frames = [Image.new("RGB", (10, 10), c) for c in ("red", "blue")]
        cls.gif = cls.folder / "move.gif"
        frames[0].save(cls.gif, save_all=True, append_images=frames[1:], duration=100)
        cls.secret = cls.outside / "secret.png"
        Image.new("RGB", (10, 10), "red").save(cls.secret)

    def tearDown(self):
        # each test starts without sequences or marks
        for f in self.folder_files().values():
            if f["sequence_id"]:
                self.request("DELETE", f"/folders/{self.folder_id}/sequences/{f['sequence_id']}")
        paths = [str(p) for p in self.p.values()]
        self.request("PUT", f"/folders/{self.folder_id}/flags", body={"paths": paths, "hidden": False, "favorite": False})

    def group(self, *names):
        status, body, _ = self.request("POST", f"/folders/{self.folder_id}/sequences", body={"paths": [str(self.p.get(n, n)) for n in names]})
        return status, json.loads(body)

    def folder_files(self):
        status, body = self.get(f"/folders/{self.folder_id}/files")
        self.assertEqual(status, 200)
        return {f["name"]: f for f in json.loads(body)}

    def playlist(self):
        status, body, _ = self.request("POST", "/folders/files", body={"items": [{"folder_id": self.folder_id, "rel_path": "", "recursive": True}]})
        self.assertEqual(status, 200)
        return [(f["name"], [p.rsplit("\\", 1)[-1].rsplit("/", 1)[-1] for p in f["frames"]]) for f in json.loads(body)]

    def test_sequence_is_one_playlist_item_in_saved_order(self):
        status, body = self.group("d", "b", "c")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["frames"]), 3)
        self.assertEqual(
            self.playlist(),
            [("a.png", []), ("d.png", ["d.png", "b.png", "c.png"]), ("e.png", []), ("move.gif", [])],
        )
        files = self.folder_files()
        self.assertEqual(files["b.png"]["sequence_id"], body["id"])
        self.assertIsNone(files["a.png"]["sequence_id"])

    def test_hidden_members_drop_out_and_short_sequences_play_as_images(self):
        self.group("a", "b", "c")
        self.request("PUT", f"/folders/{self.folder_id}/flags", body={"paths": [str(self.p["b"])], "hidden": True})
        self.assertEqual(self.playlist()[0], ("a.png", ["a.png", "c.png"]))
        self.request("PUT", f"/folders/{self.folder_id}/flags", body={"paths": [str(self.p["c"])], "hidden": True})
        self.assertEqual(self.playlist()[0], ("a.png", []))  # only one member left

    def test_regrouping_moves_photos_and_drops_emptied_sequences(self):
        _, first = self.group("a", "b")
        _, second = self.group("b", "c", "d")
        files = self.folder_files()
        self.assertIsNone(files["a.png"]["sequence_id"])  # first sequence fell below 2 and was removed
        self.assertEqual(files["b.png"]["sequence_id"], second["id"])
        self.assertEqual(self.request("DELETE", f"/folders/{self.folder_id}/sequences/{first['id']}")[0], 404)

    def test_ungroup(self):
        _, seq = self.group("a", "b")
        self.assertEqual(self.request("DELETE", f"/folders/{self.folder_id}/sequences/{seq['id']}")[0], 200)
        self.assertEqual(self.playlist()[0], ("a.png", []))

    def test_rejects_gifs_outside_paths_and_single_photos(self):
        self.assertEqual(self.group("a", str(self.gif))[0], 404)
        self.assertEqual(self.group("a", str(self.secret))[0], 404)
        self.assertEqual(self.group("a", "a")[0], 400)
        self.assertEqual(self.group("a")[0], 422)
        self.assertIsNone(self.folder_files()["a.png"]["sequence_id"])
