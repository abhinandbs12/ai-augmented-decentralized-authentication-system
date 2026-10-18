package com.blockauth.session;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserDeviceRepository extends JpaRepository<UserDevice, UUID> {

	Optional<UserDevice> findByUserIdAndDeviceId(UUID userId, UUID deviceId);

	List<UserDevice> findByUserIdAndRemovedAtIsNullOrderByLastSeenAtDesc(UUID userId);

	boolean existsByUserIdAndRemovedAtIsNullAndDeviceIdNot(UUID userId, UUID deviceId);

}
