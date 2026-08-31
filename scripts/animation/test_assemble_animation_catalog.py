import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from assemble_animation_catalog import (
    has_root_translation_channel,
    is_root_translation_within_limit,
    root_translation_metrics,
)


class InPlaceGlbGateTest(unittest.TestCase):
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

    def test_accepts_missing_root_translation_channel_as_in_place(self):
        glb = {
            "nodes": [{"name": "root"}, {"name": "pelvis"}],
            "animations": [{
                "channels": [{"target": {"node": 1, "path": "rotation"}}],
            }],
        }
        self.assertTrue(is_root_translation_within_limit(glb))

    def test_rejects_root_translation_that_moves_the_actor(self):
        glb = {
            "nodes": [{"name": "root"}],
            "animations": [{
                "channels": [{
                    "target": {"node": 0, "path": "translation"},
                    "sampler": 0,
                }],
                "samplers": [{"input": 0, "output": 1}],
            }],
        }
        accessors = {
            0: [0.0, 1.0],
            1: [0.0, 0.0, 0.0, 0.0, 0.0, 2.96625],
        }
        self.assertEqual(root_translation_metrics(glb, accessors), {
            "sampleCount": 2,
            "min": [0.0, 0.0, 0.0],
            "max": [0.0, 0.0, 2.96625],
            "range": [0.0, 0.0, 2.96625],
            "maxRange": 2.96625,
            "net": [0.0, 0.0, 2.96625],
            "maxNet": 2.96625,
        })
        self.assertFalse(is_root_translation_within_limit(glb, accessors))


if __name__ == "__main__":
    unittest.main()
