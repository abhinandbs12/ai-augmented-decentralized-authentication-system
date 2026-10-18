package com.blockauth.apikey;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.apikey.ApiKeyService.Created;
import com.blockauth.apikey.ApiKeyService.KeyView;
import com.blockauth.auth.StepUpProof;
import com.blockauth.common.PageResponse;
import com.blockauth.config.SecuritySettings;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** ADMIN-only management of read-only API keys. */
@RestController
@RequestMapping("/api/admin/api-keys")
public class ApiKeyController {

	public record CreateRequest(String name, List<String> scopes, Integer days,
			@NotNull(message = "is required") @Valid StepUpProof proof) {
	}

	private final ApiKeyService keys;
	private final SecuritySettings settings;

	public ApiKeyController(ApiKeyService keys, SecuritySettings settings) {
		this.keys = keys;
		this.settings = settings;
	}

	@GetMapping
	PageResponse<KeyView> list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		return keys.list(PageResponse.request(page, size, "createdAt"));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Created create(@Valid @RequestBody CreateRequest body, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		ApiKeySpec spec = ApiKeySpec.of(body.name(), body.scopes(), body.days(), settings.apiKeyMaxDays());
		return keys.create(admin, spec, body.proof(), ClientInfoResolver.resolve(request));
	}

	@PostMapping("/{id}/revoke")
	KeyView revoke(@PathVariable UUID id, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		return keys.revoke(admin, id, ClientInfoResolver.resolve(request));
	}

}
