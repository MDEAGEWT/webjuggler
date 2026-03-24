package com.webjuggler.parser.ulog;

public enum FieldType {
    UINT8("uint8_t", 1),
    UINT16("uint16_t", 2),
    UINT32("uint32_t", 4),
    UINT64("uint64_t", 8),
    INT8("int8_t", 1),
    INT16("int16_t", 2),
    INT32("int32_t", 4),
    INT64("int64_t", 8),
    FLOAT("float", 4),
    DOUBLE("double", 8),
    BOOL("bool", 1),
    CHAR("char", 1),
    OTHER(null, 0);

    private final String typeName;
    private final int byteSize;

    FieldType(String typeName, int byteSize) {
        this.typeName = typeName;
        this.byteSize = byteSize;
    }

    public int byteSize() {
        return byteSize;
    }

    public String typeName() {
        return typeName;
    }

    /**
     * Parse a type string from a ULog FORMAT message field.
     * Returns the matching FieldType, or OTHER if no built-in type matches.
     */
    public static FieldType fromString(String typeStr) {
        if (typeStr == null || typeStr.isEmpty()) {
            return OTHER;
        }
        for (FieldType ft : values()) {
            if (ft.typeName != null && typeStr.startsWith(ft.typeName)) {
                return ft;
            }
        }
        return OTHER;
    }
}
