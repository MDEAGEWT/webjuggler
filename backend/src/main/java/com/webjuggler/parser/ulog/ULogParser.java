package com.webjuggler.parser.ulog;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Java port of the PlotJuggler C++ ULog parser.
 * Parses PX4 ULog binary log files into typed timeseries data.
 */
public final class ULogParser {

    private static final byte[] ULOG_MAGIC = {'U', 'L', 'o', 'g', 0x01, 0x12, 0x35};
    private static final int MSG_HEADER_LEN = 3;
    private static final int INCOMPAT_FLAG0_DATA_APPENDED_MASK = 1;

    private final ByteBuffer buf;
    private long fileStartTime;
    private int dataSectionStart;
    private long readUntilFilePosition = 1L << 60;

    private final Map<String, Format> formats = new LinkedHashMap<>();
    private final Map<String, String> info = new LinkedHashMap<>();
    private final Map<Integer, Subscription> subscriptions = new LinkedHashMap<>();
    private final List<ULogFile.Parameter> parameters = new ArrayList<>();
    private final List<ULogFile.MessageLog> logs = new ArrayList<>();
    private final List<ULogFile.Dropout> dropouts = new ArrayList<>();
    private final Set<String> messageNameWithMultiId = new HashSet<>();

    // Mutable timeseries accumulators: topic -> (timestamps list, field data list of lists)
    private final Map<String, MutableTimeseries> mutableTimeseries = new LinkedHashMap<>();

    private ULogParser(byte[] data) {
        this.buf = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
    }

    public static ULogFile parse(byte[] data) {
        ULogParser parser = new ULogParser(data);
        parser.readFileHeader();
        parser.readFileDefinitions();
        parser.readDataSection();
        return parser.buildResult();
    }

    // ---- File header ----

    private void readFileHeader() {
        if (buf.remaining() < 16) {
            throw new IllegalArgumentException("ULog: file too short for header");
        }
        byte[] magic = new byte[7];
        buf.get(magic);
        if (!Arrays.equals(magic, ULOG_MAGIC)) {
            throw new IllegalArgumentException("ULog: wrong header magic");
        }
        buf.get(); // skip 8th byte of magic area
        fileStartTime = buf.getLong();
    }

    // ---- Definition section ----

    private void readFileDefinitions() {
        while (buf.remaining() >= MSG_HEADER_LEN) {
            int msgSize = Short.toUnsignedInt(buf.getShort());
            int msgType = Byte.toUnsignedInt(buf.get());

            ULogMessageType type = ULogMessageType.fromCode(msgType);
            if (type == null) {
                buf.position(buf.position() + msgSize);
                continue;
            }

            switch (type) {
                case FLAG_BITS -> readFlagBits(msgSize);
                case FORMAT -> readFormat(msgSize);
                case PARAMETER -> readParameter(msgSize);
                case INFO -> readInfo(msgSize);
                case ADD_LOGGED_MSG -> {
                    dataSectionStart = buf.position() - MSG_HEADER_LEN;
                    buf.position(dataSectionStart);
                    return;
                }
                case INFO_MULTIPLE, PARAMETER_DEFAULT -> buf.position(buf.position() + msgSize);
                default -> buf.position(buf.position() + msgSize);
            }
        }
    }

    // ---- FLAG_BITS ----

    private void readFlagBits(int msgSize) {
        if (msgSize != 40) {
            throw new IllegalArgumentException("ULog: unsupported FLAG_BITS message length: " + msgSize);
        }
        int start = buf.position();
        byte[] compatFlags = new byte[8];
        byte[] incompatFlags = new byte[8];
        buf.get(compatFlags);
        buf.get(incompatFlags);

        boolean containsAppendedData = (incompatFlags[0] & INCOMPAT_FLAG0_DATA_APPENDED_MASK) != 0;
        boolean hasUnknownIncompatBits = (incompatFlags[0] & ~0x1) != 0;
        for (int i = 1; i < 8; i++) {
            if (incompatFlags[i] != 0) {
                hasUnknownIncompatBits = true;
            }
        }

        if (hasUnknownIncompatBits) {
            throw new IllegalArgumentException("ULog: unknown incompat bits set, refusing to parse");
        }

        if (containsAppendedData) {
            long offset0 = buf.getLong();
            // skip offsets 1 and 2
            buf.getLong();
            buf.getLong();
            if (offset0 > 0) {
                readUntilFilePosition = offset0;
            }
        } else {
            // skip the 3 uint64 appended_offsets
            buf.position(start + msgSize);
        }
    }

    // ---- FORMAT ----

    private void readFormat(int msgSize) {
        byte[] raw = new byte[msgSize];
        buf.get(raw);
        String str = new String(raw, StandardCharsets.US_ASCII).trim();

        int colonPos = str.indexOf(':');
        if (colonPos < 0) {
            throw new IllegalArgumentException("ULog: FORMAT message missing ':'");
        }

        String name = str.substring(0, colonPos);
        String fieldsStr = str.substring(colonPos + 1);
        String[] fieldSections = fieldsStr.split(";");

        List<Field> fields = new ArrayList<>();
        int timestampIdx = -1;

        for (String section : fieldSections) {
            section = section.trim();
            if (section.isEmpty()) continue;

            String[] tokens = section.split("\\s+");
            if (tokens.length < 2) continue;

            String typeStr = tokens[0];
            String fieldName = tokens[1];

            FieldType fieldType = FieldType.fromString(typeStr);
            String otherTypeName = null;
            int arraySize = 1;

            if (fieldType == FieldType.OTHER) {
                // Extract the other type name and possible array suffix
                int bracketPos = typeStr.indexOf('[');
                if (bracketPos >= 0) {
                    otherTypeName = typeStr.substring(0, bracketPos);
                    arraySize = parseArraySize(typeStr.substring(bracketPos));
                } else {
                    otherTypeName = typeStr;
                }
            } else {
                // For built-in types, check for array suffix after the type name
                String suffix = typeStr.substring(fieldType.typeName().length());
                if (!suffix.isEmpty() && suffix.charAt(0) == '[') {
                    arraySize = parseArraySize(suffix);
                }
            }

            // Timestamp field gets special handling — not added to fields list
            if (fieldType == FieldType.UINT64 && fieldName.equals("timestamp")) {
                timestampIdx = fields.size();
            } else {
                fields.add(new Field(fieldName, fieldType, otherTypeName, arraySize));
            }
        }

        Format format = new Format(name, Collections.unmodifiableList(fields), timestampIdx);
        formats.put(name, format);
    }

    private static int parseArraySize(String bracketStr) {
        // e.g. "[3]" -> 3
        int start = bracketStr.indexOf('[');
        int end = bracketStr.indexOf(']');
        if (start < 0 || end < 0) return 1;
        return Integer.parseInt(bracketStr.substring(start + 1, end));
    }

    // ---- INFO ----

    private void readInfo(int msgSize) {
        int start = buf.position();
        int keyLen = Byte.toUnsignedInt(buf.get());
        byte[] keyBytes = new byte[keyLen];
        buf.get(keyBytes);
        String rawKey = new String(keyBytes, StandardCharsets.US_ASCII);

        int valueLen = msgSize - keyLen - 1;
        byte[] valueBytes = new byte[valueLen];
        buf.get(valueBytes);

        int spacePos = rawKey.indexOf(' ');
        if (spacePos < 0) {
            // skip malformed
            return;
        }
        String typeStr = rawKey.substring(0, spacePos);
        String key = rawKey.substring(spacePos + 1);
        String value;

        ByteBuffer vb = ByteBuffer.wrap(valueBytes).order(ByteOrder.LITTLE_ENDIAN);

        if (typeStr.startsWith("char[")) {
            value = new String(valueBytes, StandardCharsets.US_ASCII);
        } else {
            value = switch (typeStr) {
                case "bool" -> String.valueOf(valueBytes[0] != 0);
                case "uint8_t" -> String.valueOf(Byte.toUnsignedInt(valueBytes[0]));
                case "int8_t" -> String.valueOf(valueBytes[0]);
                case "uint16_t" -> String.valueOf(Short.toUnsignedInt(vb.getShort()));
                case "int16_t" -> String.valueOf(vb.getShort());
                case "uint32_t" -> {
                    long val = Integer.toUnsignedLong(vb.getInt());
                    if (key.startsWith("ver_") && key.endsWith("_release")) {
                        yield "0x" + String.format("%08x", val);
                    }
                    yield String.valueOf(val);
                }
                case "int32_t" -> String.valueOf(vb.getInt());
                case "float" -> String.valueOf(vb.getFloat());
                case "double" -> String.valueOf(vb.getDouble());
                case "uint64_t" -> String.valueOf(Long.toUnsignedString(vb.getLong()));
                case "int64_t" -> String.valueOf(vb.getLong());
                default -> new String(valueBytes, StandardCharsets.US_ASCII);
            };
        }

        info.put(key, value);
    }

    // ---- PARAMETER ----

    private void readParameter(int msgSize) {
        int start = buf.position();
        int keyLen = Byte.toUnsignedInt(buf.get());
        byte[] keyBytes = new byte[keyLen];
        buf.get(keyBytes);
        String rawKey = new String(keyBytes, StandardCharsets.US_ASCII);

        int spacePos = rawKey.indexOf(' ');
        if (spacePos < 0) {
            buf.position(start + msgSize);
            return;
        }
        String typeStr = rawKey.substring(0, spacePos);
        String paramName = rawKey.substring(spacePos + 1);

        ULogFile.Parameter param;
        if (typeStr.equals("int32_t")) {
            int val = buf.getInt();
            param = new ULogFile.Parameter(paramName, FieldType.INT32, val, 0f);
        } else if (typeStr.equals("float")) {
            float val = buf.getFloat();
            param = new ULogFile.Parameter(paramName, FieldType.FLOAT, 0, val);
        } else {
            buf.position(start + msgSize);
            return;
        }

        parameters.add(param);
    }

    // ---- Data section ----

    private void readDataSection() {
        buf.position(dataSectionStart);

        while (buf.remaining() >= MSG_HEADER_LEN && buf.position() < readUntilFilePosition) {
            int msgSize = Short.toUnsignedInt(buf.getShort());
            int msgType = Byte.toUnsignedInt(buf.get());

            if (buf.remaining() < msgSize) break;

            int msgEnd = buf.position() + msgSize;

            ULogMessageType type = ULogMessageType.fromCode(msgType);
            if (type == null) {
                buf.position(msgEnd);
                continue;
            }

            try {
                switch (type) {
                    case ADD_LOGGED_MSG -> {
                        int multiId = Byte.toUnsignedInt(buf.get());
                        int msgId = Short.toUnsignedInt(buf.getShort());
                        byte[] nameBytes = new byte[msgSize - 3];
                        buf.get(nameBytes);
                        String messageName = new String(nameBytes, StandardCharsets.US_ASCII).trim();

                        Format format = formats.get(messageName);
                        Subscription sub = new Subscription(msgId, multiId, messageName, format);
                        subscriptions.put(msgId, sub);

                        if (multiId > 0) {
                            messageNameWithMultiId.add(messageName);
                        }
                    }
                    case REMOVE_LOGGED_MSG -> {
                        int msgId = Short.toUnsignedInt(buf.getShort());
                        subscriptions.remove(msgId);
                    }
                    case DATA -> {
                        int msgId = Short.toUnsignedInt(buf.getShort());
                        Subscription sub = subscriptions.get(msgId);
                        if (sub == null || sub.format() == null) {
                            buf.position(msgEnd);
                            continue;
                        }
                        parseDataMessage(sub);
                    }
                    case LOGGING -> {
                        if (msgSize >= 9) {
                            char level = (char) buf.get();
                            long timestamp = buf.getLong();
                            byte[] msgBytes = new byte[msgSize - 9];
                            buf.get(msgBytes);
                            String message = new String(msgBytes, StandardCharsets.US_ASCII).trim();
                            logs.add(new ULogFile.MessageLog(level, timestamp, message));
                        }
                    }
                    case DROPOUT -> {
                        int duration = Short.toUnsignedInt(buf.getShort());
                        dropouts.add(new ULogFile.Dropout(duration));
                    }
                    case PARAMETER -> {
                        int start = buf.position();
                        int keyLen = Byte.toUnsignedInt(buf.get());
                        byte[] keyBytes = new byte[keyLen];
                        buf.get(keyBytes);
                        String rawKey = new String(keyBytes, StandardCharsets.US_ASCII);
                        int spacePos = rawKey.indexOf(' ');
                        if (spacePos < 0) {
                            break;
                        }
                        String typeStr = rawKey.substring(0, spacePos);
                        String paramName = rawKey.substring(spacePos + 1);

                        ULogFile.Parameter newParam;
                        if (typeStr.equals("int32_t")) {
                            int val = buf.getInt();
                            newParam = new ULogFile.Parameter(paramName, FieldType.INT32, val, 0f);
                        } else if (typeStr.equals("float")) {
                            float val = buf.getFloat();
                            newParam = new ULogFile.Parameter(paramName, FieldType.FLOAT, 0, val);
                        } else {
                            break;
                        }

                        // Dedup: overwrite existing parameter with same name
                        boolean found = false;
                        for (int i = 0; i < parameters.size(); i++) {
                            if (parameters.get(i).name().equals(paramName)) {
                                parameters.set(i, newParam);
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            parameters.add(newParam);
                        }
                    }
                    default -> { /* skip */ }
                }
            } catch (Exception e) {
                // If any individual message fails to parse, skip it and continue
            }
            // Always advance to the end of this message
            buf.position(msgEnd);
        }
    }

    // ---- Parse a single DATA message ----

    private void parseDataMessage(Subscription sub) {
        String tsName = sub.messageName();
        if (messageNameWithMultiId.contains(tsName)) {
            tsName = tsName + String.format(".%02d", sub.multiId());
        }

        MutableTimeseries mts = mutableTimeseries.get(tsName);
        if (mts == null) {
            mts = createMutableTimeseries(sub.format());
            mutableTimeseries.put(tsName, mts);
        }

        int[] index = {0};
        parseFields(mts, sub.format(), index, true);
    }

    private void parseFields(MutableTimeseries ts, Format format, int[] index, boolean readTimestamp) {
        List<Field> fields = format.fields();

        for (int i = 0; i <= fields.size(); i++) {
            // Check if timestamp should be read at this position
            if (format.timestampIdx() == i) {
                long timeVal = buf.getLong();
                if (readTimestamp) {
                    ts.timestamps.add(timeVal);
                }
            }

            if (i == fields.size()) break;

            Field field = fields.get(i);

            // Skip _padding fields
            if (field.name().startsWith("_padding")) {
                buf.position(buf.position() + field.arraySize());
                continue;
            }

            for (int arrayPos = 0; arrayPos < field.arraySize(); arrayPos++) {
                if (field.type() != FieldType.OTHER) {
                    double value = readTypedValue(field.type());
                    ts.fieldValues.get(index[0]++).add(value);
                } else {
                    // Recursion for nested types
                    Format childFormat = formats.get(field.otherTypeName());
                    if (childFormat != null) {
                        parseFields(ts, childFormat, index, false);
                    }
                }
            }
        }

        if (readTimestamp && format.timestampIdx() < 0) {
            // No timestamp in this format — add a NaN marker
            ts.timestamps.add(null);
        }
    }

    private double readTypedValue(FieldType type) {
        return switch (type) {
            case UINT8 -> Byte.toUnsignedInt(buf.get());
            case INT8 -> buf.get();
            case UINT16 -> Short.toUnsignedInt(buf.getShort());
            case INT16 -> buf.getShort();
            case UINT32 -> Integer.toUnsignedLong(buf.getInt());
            case INT32 -> buf.getInt();
            case UINT64 -> (double) buf.getLong();
            case INT64 -> (double) buf.getLong();
            case FLOAT -> buf.getFloat();
            case DOUBLE -> buf.getDouble();
            case CHAR -> (double) buf.get();
            case BOOL -> buf.get() != 0 ? 1.0 : 0.0;
            case OTHER -> 0.0; // should not happen
        };
    }

    // ---- Create mutable timeseries skeleton ----

    private MutableTimeseries createMutableTimeseries(Format format) {
        MutableTimeseries mts = new MutableTimeseries();
        appendFields(mts, format, "");
        return mts;
    }

    private void appendFields(MutableTimeseries mts, Format format, String prefix) {
        for (Field field : format.fields()) {
            if (field.name().startsWith("_padding")) continue;

            String newPrefix = prefix + "/" + field.name();
            for (int i = 0; i < field.arraySize(); i++) {
                String arraySuffix = field.arraySize() > 1 ? String.format(".%02d", i) : "";
                if (field.type() != FieldType.OTHER) {
                    mts.fieldNames.add(newPrefix + arraySuffix);
                    mts.fieldValues.add(new ArrayList<>());
                } else {
                    Format childFormat = formats.get(field.otherTypeName());
                    if (childFormat != null) {
                        appendFields(mts, childFormat, newPrefix + arraySuffix);
                    }
                }
            }
        }
    }

    // ---- Build final immutable result ----

    private ULogFile buildResult() {
        Map<String, Timeseries> result = new LinkedHashMap<>();

        for (var entry : mutableTimeseries.entrySet()) {
            MutableTimeseries mts = entry.getValue();

            // Convert timestamps: (raw_us - file_start_us) / 1_000_000.0
            double[] timestamps = new double[mts.timestamps.size()];
            for (int i = 0; i < mts.timestamps.size(); i++) {
                Long raw = mts.timestamps.get(i);
                if (raw != null) {
                    timestamps[i] = (raw - fileStartTime) / 1_000_000.0;
                } else {
                    timestamps[i] = Double.NaN;
                }
            }

            List<Timeseries.FieldData> fieldDataList = new ArrayList<>();
            for (int i = 0; i < mts.fieldNames.size(); i++) {
                List<Double> vals = mts.fieldValues.get(i);
                double[] arr = new double[vals.size()];
                for (int j = 0; j < vals.size(); j++) {
                    arr[j] = vals.get(j);
                }
                fieldDataList.add(new Timeseries.FieldData(mts.fieldNames.get(i), arr));
            }

            result.put(entry.getKey(), new Timeseries(timestamps, Collections.unmodifiableList(fieldDataList)));
        }

        return new ULogFile(
                Collections.unmodifiableMap(result),
                Collections.unmodifiableMap(info),
                Collections.unmodifiableList(parameters),
                Collections.unmodifiableList(logs),
                Collections.unmodifiableList(dropouts),
                fileStartTime
        );
    }

    // ---- Mutable accumulator ----

    private static class MutableTimeseries {
        final List<Long> timestamps = new ArrayList<>();
        final List<String> fieldNames = new ArrayList<>();
        final List<List<Double>> fieldValues = new ArrayList<>();
    }
}
