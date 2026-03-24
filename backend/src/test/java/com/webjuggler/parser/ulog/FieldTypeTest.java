package com.webjuggler.parser.ulog;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FieldTypeTest {

    @Test
    void fromString_basicTypes() {
        assertEquals(FieldType.UINT8, FieldType.fromString("uint8_t"));
        assertEquals(FieldType.UINT16, FieldType.fromString("uint16_t"));
        assertEquals(FieldType.UINT32, FieldType.fromString("uint32_t"));
        assertEquals(FieldType.UINT64, FieldType.fromString("uint64_t"));
        assertEquals(FieldType.INT8, FieldType.fromString("int8_t"));
        assertEquals(FieldType.INT16, FieldType.fromString("int16_t"));
        assertEquals(FieldType.INT32, FieldType.fromString("int32_t"));
        assertEquals(FieldType.INT64, FieldType.fromString("int64_t"));
        assertEquals(FieldType.FLOAT, FieldType.fromString("float"));
        assertEquals(FieldType.DOUBLE, FieldType.fromString("double"));
        assertEquals(FieldType.BOOL, FieldType.fromString("bool"));
        assertEquals(FieldType.CHAR, FieldType.fromString("char"));
    }

    @Test
    void fromString_arrayTypes() {
        assertEquals(FieldType.UINT8, FieldType.fromString("uint8_t[3]"));
        assertEquals(FieldType.FLOAT, FieldType.fromString("float[4]"));
        assertEquals(FieldType.CHAR, FieldType.fromString("char[20]"));
    }

    @Test
    void fromString_otherType() {
        assertEquals(FieldType.OTHER, FieldType.fromString("vehicle_status"));
        assertEquals(FieldType.OTHER, FieldType.fromString("some_struct[3]"));
    }

    @Test
    void fromString_nullAndEmpty() {
        assertEquals(FieldType.OTHER, FieldType.fromString(null));
        assertEquals(FieldType.OTHER, FieldType.fromString(""));
    }

    @Test
    void byteSize_values() {
        assertEquals(1, FieldType.UINT8.byteSize());
        assertEquals(2, FieldType.UINT16.byteSize());
        assertEquals(4, FieldType.UINT32.byteSize());
        assertEquals(8, FieldType.UINT64.byteSize());
        assertEquals(1, FieldType.INT8.byteSize());
        assertEquals(2, FieldType.INT16.byteSize());
        assertEquals(4, FieldType.INT32.byteSize());
        assertEquals(8, FieldType.INT64.byteSize());
        assertEquals(4, FieldType.FLOAT.byteSize());
        assertEquals(8, FieldType.DOUBLE.byteSize());
        assertEquals(1, FieldType.BOOL.byteSize());
        assertEquals(1, FieldType.CHAR.byteSize());
        assertEquals(0, FieldType.OTHER.byteSize());
    }
}
