package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework LocalAuthentication -framework Foundation
#import <LocalAuthentication/LocalAuthentication.h>
#include <stdlib.h>
#include <string.h>

// canAuth: can the device owner be asked (Touch ID, or the login password)?
static int canAuth(void) {
	LAContext *c = [LAContext new];
	NSError *e = nil;
	return [c canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&e] ? 1 : 0;
}

// authenticate shows the system prompt and waits for the answer. It must not
// run on the main thread (the reply arrives on a private queue).
static int authenticate(const char *reason, char **errOut) {
	__block int ok = 0;
	__block NSString *msg = nil;
	dispatch_semaphore_t done = dispatch_semaphore_create(0);
	LAContext *c = [LAContext new];
	[c evaluatePolicy:LAPolicyDeviceOwnerAuthentication
	  localizedReason:[NSString stringWithUTF8String:reason]
	            reply:^(BOOL success, NSError *error) {
		ok = success ? 1 : 0;
		if (error) msg = error.localizedDescription;
		dispatch_semaphore_signal(done);
	}];
	dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
	if (msg) *errOut = strdup(msg.UTF8String);
	return ok;
}
*/
import "C"

import (
	"errors"
	"unsafe"
)

// canAuthenticate reports whether Touch ID or the login password can be asked for.
func canAuthenticate() bool { return C.canAuth() == 1 }

// authenticate asks the device owner (Touch ID, falling back to the login
// password). A cancelled prompt is (false, error with the system's reason).
func authenticate(reason string) (bool, error) {
	cr := C.CString(reason)
	defer C.free(unsafe.Pointer(cr))
	var cerr *C.char
	ok := C.authenticate(cr, &cerr) == 1
	if cerr != nil {
		defer C.free(unsafe.Pointer(cerr))
		if !ok {
			return false, errors.New(C.GoString(cerr))
		}
	}
	return ok, nil
}
