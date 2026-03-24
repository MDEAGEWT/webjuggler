package com.webjuggler.parser.ulog;

public enum ULogMessageType {
    FORMAT('F'),
    DATA('D'),
    INFO('I'),
    INFO_MULTIPLE('M'),
    PARAMETER('P'),
    PARAMETER_DEFAULT('Q'),
    ADD_LOGGED_MSG('A'),
    REMOVE_LOGGED_MSG('R'),
    SYNC('S'),
    DROPOUT('O'),
    LOGGING('L'),
    LOGGING_TAGGED('C'),
    FLAG_BITS('B');

    private final int code;

    ULogMessageType(int code) {
        this.code = code;
    }

    public int code() {
        return code;
    }

    public static ULogMessageType fromCode(int code) {
        for (ULogMessageType t : values()) {
            if (t.code == code) {
                return t;
            }
        }
        return null;
    }
}
