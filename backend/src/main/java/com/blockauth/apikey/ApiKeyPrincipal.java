package com.blockauth.apikey;

import java.util.UUID;

/** Who a key-authenticated request acts for. It holds scopes only, never a role. */
public record ApiKeyPrincipal(UUID keyId, String name, UUID ownerId) {
}
