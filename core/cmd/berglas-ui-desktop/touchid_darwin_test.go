package main

import "testing"

// Asking never happens in tests (it needs a person); this only checks the
// LocalAuthentication bridge loads and answers.
func TestCanAuthenticateAnswers(t *testing.T) {
	t.Logf("touch id or password available: %v", canAuthenticate())
}
