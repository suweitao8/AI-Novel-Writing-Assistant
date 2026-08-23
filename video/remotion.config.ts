import { Config } from "@remotion/cli/config";
import { resolveDramaRemotionConcurrency } from "./src/remotionConcurrency";

Config.setCodec("h264");
Config.setConcurrency(resolveDramaRemotionConcurrency());
Config.setOverwriteOutput(true);
