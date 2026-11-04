// Package gcpauth decides which Google identity the core acts as: the user's
// Application Default Credentials, optionally impersonating a service
// account, optionally billing quota to another project.
package gcpauth

import (
	"context"
	"fmt"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/impersonate"
	"google.golang.org/api/option"
)

const scope = "https://www.googleapis.com/auth/cloud-platform"

// Auth is the identity configuration. The zero value means plain ADC.
type Auth struct {
	// Impersonate is a service account email. The ADC identity needs
	// roles/iam.serviceAccountTokenCreator on it.
	Impersonate string
	// QuotaProject bills api quota to this project.
	QuotaProject string
}

// TokenSource returns tokens for the identity the core acts as, and the
// project ADC names (may be empty).
func (a Auth) TokenSource(ctx context.Context) (oauth2.TokenSource, string, error) {
	creds, err := google.FindDefaultCredentials(ctx, scope)
	if err != nil {
		return nil, "", err
	}
	if a.Impersonate == "" {
		return creds.TokenSource, creds.ProjectID, nil
	}
	ts, err := impersonate.CredentialsTokenSource(ctx, impersonate.CredentialsConfig{
		TargetPrincipal: a.Impersonate,
		Scopes:          []string{scope},
	})
	if err != nil {
		return nil, "", fmt.Errorf("impersonate %s: %w", a.Impersonate, err)
	}
	return ts, creds.ProjectID, nil
}

// ClientOptions are passed to the berglas client. Plain ADC needs none,
// which leaves credential discovery to the Google client libraries.
func (a Auth) ClientOptions(ctx context.Context) ([]option.ClientOption, error) {
	var opts []option.ClientOption
	if a.Impersonate != "" {
		ts, _, err := a.TokenSource(ctx)
		if err != nil {
			return nil, err
		}
		opts = append(opts, option.WithTokenSource(ts))
	}
	if a.QuotaProject != "" {
		opts = append(opts, option.WithQuotaProject(a.QuotaProject))
	}
	return opts, nil
}
