package com.blockauth.session;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceRepository extends JpaRepository<Device, UUID> {

	Optional<Device> findByTokenHash(String tokenHash);

}
