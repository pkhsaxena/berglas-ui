package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework AppKit -framework Foundation
#import <AppKit/AppKit.h>
#include <stdlib.h>
#include <string.h>

// setClip puts text on the general pasteboard as a private copy: marked
// concealed and transient (the nspasteboard.org convention clipboard
// managers follow to leave a copy out of their history), and, unless
// universal is set, kept on this Mac (out of Universal Clipboard).
// An empty text clears the pasteboard instead. Returns 1 on success.
static int setClip(const char *s, int len, int universal) {
	@autoreleasepool {
		NSPasteboard *pb = [NSPasteboard generalPasteboard];
		if (len == 0) {
			[pb clearContents];
			return 1;
		}
		NSString *str = [[NSString alloc] initWithBytes:s length:(NSUInteger)len encoding:NSUTF8StringEncoding];
		if (str == nil) return 0;
		if (universal) {
			[pb clearContents];
		} else {
			[pb prepareForNewContentsWithOptions:NSPasteboardContentsCurrentHostOnly];
		}
		if (![pb setString:str forType:NSPasteboardTypeString]) return 0;
		[pb setData:[NSData data] forType:@"org.nspasteboard.ConcealedType"];
		[pb setData:[NSData data] forType:@"org.nspasteboard.TransientType"];
		return 1;
	}
}

// getClip returns the pasteboard's text (malloc'd, the caller frees it), or NULL.
static char *getClip(void) {
	@autoreleasepool {
		NSString *str = [[NSPasteboard generalPasteboard] stringForType:NSPasteboardTypeString];
		if (str == nil) return NULL;
		return strdup([str UTF8String]);
	}
}

// clipTypes returns the pasteboard's types, one per line (malloc'd), for the self-test.
static char *clipTypes(void) {
	@autoreleasepool {
		NSArray<NSPasteboardType> *types = [[NSPasteboard generalPasteboard] types];
		return strdup([[types componentsJoinedByString:@"\n"] UTF8String]);
	}
}
*/
import "C"

import (
	"errors"
	"strings"
	"unsafe"
)

// setClipboard puts a private copy of text on the macOS clipboard; "" clears it.
// Wails' own clipboard pipes to pbcopy, which can't mark a copy private.
func setClipboard(text string, universal bool) error {
	cs := C.CString(text)
	defer C.free(unsafe.Pointer(cs))
	u := C.int(0)
	if universal {
		u = 1
	}
	if C.setClip(cs, C.int(len(text)), u) == 0 {
		return errors.New("couldn't write the clipboard")
	}
	return nil
}

// clipboardText is the clipboard's text, "" when it holds none.
func clipboardText() string {
	cs := C.getClip()
	if cs == nil {
		return ""
	}
	defer C.free(unsafe.Pointer(cs))
	return C.GoString(cs)
}

// clipboardTypes lists what the clipboard holds (its pasteboard types).
func clipboardTypes() []string {
	cs := C.clipTypes()
	if cs == nil {
		return nil
	}
	defer C.free(unsafe.Pointer(cs))
	return strings.Split(C.GoString(cs), "\n")
}
