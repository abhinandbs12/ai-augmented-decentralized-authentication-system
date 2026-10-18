package com.blockauth.common;

import java.time.Instant;

import org.springframework.data.jpa.domain.Specification;

/** Optional-filter building blocks for admin list queries; a null value means "no filter". */
public final class Specs {

	private Specs() {
	}

	public static <T> Specification<T> eq(String field, Object value) {
		return (root, query, cb) -> value == null ? cb.conjunction() : cb.equal(root.get(field), value);
	}

	public static <T> Specification<T> between(String field, Instant from, Instant to) {
		if (from != null && to != null && from.isAfter(to)) {
			throw BlockAuthException.invalid("from", "must not be after 'to'");
		}
		return (root, query, cb) -> cb.and(
				from == null ? cb.conjunction() : cb.greaterThanOrEqualTo(root.get(field), from),
				to == null ? cb.conjunction() : cb.lessThanOrEqualTo(root.get(field), to));
	}

}
