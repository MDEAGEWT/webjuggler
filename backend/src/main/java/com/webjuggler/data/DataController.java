package com.webjuggler.data;

import com.webjuggler.file.FileService;
import com.webjuggler.parser.ulog.Timeseries;
import com.webjuggler.parser.ulog.ULogFile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/files")
public class DataController {

    private final FileService fileService;

    public DataController(FileService fileService) {
        this.fileService = fileService;
    }

    @GetMapping("/{fileId}/topics")
    public ResponseEntity<TopicResponse> getTopics(@PathVariable String fileId) {
        ULogFile ulog = fileService.getParsed(fileId);

        List<TopicResponse.TopicEntry> entries = new ArrayList<>();
        for (var entry : ulog.timeseries().entrySet()) {
            String topicName = entry.getKey();
            Timeseries ts = entry.getValue();

            List<String> fieldNames = new ArrayList<>();
            for (Timeseries.FieldData fd : ts.data()) {
                fieldNames.add(fd.name());
            }

            entries.add(new TopicResponse.TopicEntry(topicName, fieldNames, ts.timestamps().length));
        }

        return ResponseEntity.ok(new TopicResponse(entries));
    }

    @GetMapping("/{fileId}/info")
    public ResponseEntity<InfoResponse> getInfo(@PathVariable String fileId) {
        ULogFile ulog = fileService.getParsed(fileId);

        List<InfoResponse.ParameterEntry> paramEntries = new ArrayList<>();
        for (ULogFile.Parameter p : ulog.parameters()) {
            paramEntries.add(new InfoResponse.ParameterEntry(
                    p.name(), p.type().name(), p.floatValue(), p.intValue()));
        }

        double duration = 0.0;
        long totalDataPoints = 0;
        for (Timeseries ts : ulog.timeseries().values()) {
            double[] timestamps = ts.timestamps();
            if (timestamps.length > 0) {
                double maxTs = timestamps[timestamps.length - 1];
                if (maxTs > duration) {
                    duration = maxTs;
                }
            }
            totalDataPoints += timestamps.length;
        }

        return ResponseEntity.ok(new InfoResponse(
                ulog.info(),
                paramEntries,
                duration,
                ulog.timeseries().size(),
                totalDataPoints,
                ulog.fileStartTime(),
                extractGpsOffsetUs(ulog)));
    }

    private Long extractGpsOffsetUs(ULogFile ulog) {
        try {
            Long offset;
            offset = tryGpsOffset(ulog, "piksi_rtk", "/utc_usec");
            if (offset != null) return offset;
            offset = tryGpsOffset(ulog, "sensor_gnss_relative", "/time_utc_usec");
            return offset;
        } catch (Exception e) {
            return null;
        }
    }

    private Long tryGpsOffset(ULogFile ulog, String topicName, String fieldName) {
        Timeseries ts = ulog.timeseries().get(topicName);
        if (ts == null || ts.timestamps().length == 0) return null;

        for (Timeseries.FieldData fd : ts.data()) {
            if (!fd.name().equals(fieldName)) continue;
            if (fd.values().length == 0) continue;

            double gpsUtcUsec = fd.values()[0];
            if (!Double.isFinite(gpsUtcUsec) || gpsUtcUsec <= 0) continue;

            double relativeSec = ts.timestamps()[0];
            long bootUs = (long)(relativeSec * 1_000_000.0) + ulog.fileStartTime();

            return (long)gpsUtcUsec - bootUs;
        }
        return null;
    }

    @PostMapping("/{fileId}/data")
    public ResponseEntity<DataResponse> getData(@PathVariable String fileId,
                                                @RequestBody DataRequest request) {
        ULogFile ulog = fileService.getParsed(fileId);

        Map<String, DataResponse.FieldTimeseries> fieldMap = new LinkedHashMap<>();

        for (String fieldPath : request.fields()) {
            // fieldPath format: "topicName/fieldName" where fieldName starts with "/"
            // e.g., "vehicle_attitude/rollspeed" means topic "vehicle_attitude", field "/rollspeed"
            // Find the split point: first "/" that separates the topic name from the field
            String topicName = null;
            String fieldName = null;

            // Try to match against known topic names
            for (String key : ulog.timeseries().keySet()) {
                if (fieldPath.startsWith(key) && fieldPath.length() > key.length()
                        && fieldPath.charAt(key.length()) == '/') {
                    topicName = key;
                    fieldName = "/" + fieldPath.substring(key.length() + 1);
                    break;
                }
            }

            if (topicName == null) {
                // Could not match topic; skip this field
                continue;
            }

            Timeseries ts = ulog.timeseries().get(topicName);
            if (ts == null) {
                continue;
            }

            for (Timeseries.FieldData fd : ts.data()) {
                if (fd.name().equals(fieldName)) {
                    fieldMap.put(fieldPath, new DataResponse.FieldTimeseries(
                            ts.timestamps(), fd.values()));
                    break;
                }
            }
        }

        // Build dropout list with approximate timestamps
        List<DataResponse.DropoutEntry> dropoutEntries = new ArrayList<>();
        for (ULogFile.Dropout d : ulog.dropouts()) {
            dropoutEntries.add(new DataResponse.DropoutEntry(0.0, d.durationMs()));
        }

        return ResponseEntity.ok(new DataResponse(fieldMap, dropoutEntries));
    }
}
