package com.blockauth.common;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

	public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
		return new PageResponse<>(page.getContent().stream().map(mapper).toList(), page.getNumber(), page.getSize(),
				page.getTotalElements(), page.getTotalPages());
	}

	/** Validated, newest-first page request (page >= 0, size 1-100). */
	public static Pageable request(int page, int size, String sortField) {
		return request(page, size, Sort.by(Sort.Direction.DESC, sortField, "id"));
	}

	/** Validated page request (page >= 0, size 1-100) in the given order. */
	public static Pageable request(int page, int size, Sort sort) {
		if (page < 0) {
			throw BlockAuthException.invalid("page", "must be 0 or greater");
		}
		if (size < 1 || size > 100) {
			throw BlockAuthException.invalid("size", "must be between 1 and 100");
		}
		return PageRequest.of(page, size, sort);
	}

}
