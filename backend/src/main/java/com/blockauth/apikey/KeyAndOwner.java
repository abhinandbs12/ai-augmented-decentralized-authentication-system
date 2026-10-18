package com.blockauth.apikey;

import com.blockauth.user.User;

public record KeyAndOwner(ApiKey key, User owner) {
}
