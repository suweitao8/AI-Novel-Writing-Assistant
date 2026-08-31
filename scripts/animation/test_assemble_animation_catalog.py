import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from assemble_animation_catalog import has_root_translation_channel


class RootMotionGlbGateTest(unittest.TestCase):
    def test_accepts_translation_channel_targeting_root_node(self):
        glb = {
            "nodes": [{"name": "root"}, {"name": "pelvis"}],
            "animations": [{
                "channels": [{"target": {"node": 0, "path": "translation"}}],
            }],
        }
        self.assertTrue(has_root_translation_channel(glb))

    def test_rejects_pelvis_only_translation(self):
        glb = {
            "nodes": [{"name": "root"}, {"name": "pelvis"}],
            "animations": [{
                "channels": [{"target": {"node": 1, "path": "translation"}}],
            }],
        }
        self.assertFalse(has_root_translation_channel(glb))


if __name__ == "__main__":
    unittest.main()
