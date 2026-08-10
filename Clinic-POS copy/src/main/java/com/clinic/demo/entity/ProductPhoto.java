package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A product's shelf photo, held beside the clinic's own data rather than in
 * object storage.
 *
 * This deployment has no bucket configured and no credentials for one, so a
 * file service would be infrastructure to stand up before a single photo could
 * be saved. A bounded 640px JPEG is well under 200KB and a clinic carries
 * hundreds of products, not millions. If that ever stops being true, swapping
 * to object storage replaces this class and its repository — the API the
 * devices talk to does not change.
 */
@Entity
@Table(name = "product_photos")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductPhoto {

    /** The product's own id: a product has at most one shelf photo. */
    @Id
    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "clinic_id", nullable = false)
    private UUID clinicId;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    /**
     * Fingerprint of the bytes, mirrored onto Product.photoKey. A device
     * compares it against the copy it already cached and downloads only when
     * they differ, so opening Stocks does not re-pull every image.
     */
    @Column(name = "photo_key", nullable = false)
    private String photoKey;

    @Lob
    @Column(name = "bytes", nullable = false)
    private byte[] bytes;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
