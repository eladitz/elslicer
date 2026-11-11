#include "ColourBands.hpp"

#include <algorithm>
#include <limits>
#include <memory>

#include "Model.hpp"
#include "TriangleSelector.hpp"

namespace Slic3r {
namespace ColourBands {

void paint(ModelObject &object, const Vec3d &direction, const std::vector<unsigned int> &filaments)
{
    if (filaments.empty() || object.instances.empty() || direction.squaredNorm() < 1e-12)
        return;
    // Turns the direction into +Z, so each band is a height range of the painting tool.
    const Transform3d along(Eigen::Quaterniond::FromTwoVectors(direction.normalized(), Vec3d::UnitZ()));
    const Transform3d instance = object.instances.front()->get_matrix();

    double low = std::numeric_limits<double>::max(), high = std::numeric_limits<double>::lowest();
    for (const ModelVolume *volume : object.volumes)
        if (volume->is_model_part()) {
            const Transform3d to_band = along * instance * volume->get_matrix();
            for (const stl_vertex &vertex : volume->mesh().its.vertices) {
                const double z = (to_band * vertex.cast<double>()).z();
                low            = std::min(low, z);
                high           = std::max(high, z);
            }
        }
    if (high <= low)
        return;
    const double width = (high - low) / double(filaments.size());

    for (ModelVolume *volume : object.volumes) {
        if (!volume->is_model_part())
            continue;
        const Transform3d to_bed  = instance * volume->get_matrix();
        const Transform3d to_band = along * to_bed;
        Transform3d       to_bed_no_move = Transform3d::Identity();
        to_bed_no_move.linear()          = to_bed.linear();
        TriangleSelector  selector(volume->mesh());
        for (size_t band = 0; band < filaments.size(); ++band) {
            const EnforcerBlockerType state = EnforcerBlockerType(int(EnforcerBlockerType::Extruder1) + int(filaments[band]) - 1);
            // The outer bands reach past the object, so nothing at its ends is missed.
            const double from   = band == 0 ? low - 1. : low + width * double(band);
            const double height = band + 1 == filaments.size() ? high + 1. - from : low + width * double(band + 1) - from;
            selector.select_patch(0,
                                  std::make_unique<TriangleSelector::HeightRange>(float(from), Vec3f::Zero(), float(height), to_band,
                                                                                  TriangleSelector::ClippingPlane()),
                                  state, to_bed_no_move, true);
        }
        volume->mmu_segmentation_facets.set(selector);
    }
}

} // namespace ColourBands
} // namespace Slic3r
