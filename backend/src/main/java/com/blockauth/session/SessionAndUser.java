package com.blockauth.session;

import com.blockauth.user.User;

/** A session record with its user, loaded in one query on every authenticated request. */
public record SessionAndUser(UserSession session, User user) {
}
