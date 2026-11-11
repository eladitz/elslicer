#include "GradientDirection.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <set>

#include "ClipperUtils.hpp"
#include "Layer.hpp"
#include "LocalesUtils.hpp"
#include "Model.hpp"
#include "Print.hpp"
#include "PrintConfig.hpp"
#include "TriangleSelector.hpp"

namespace Slic3r {
namespace GradientDirection {

const char *const KEY = "elslicer_gradient_direction";

std::optional<Vec3d> of(const ModelObject &object)
{
    const auto *values = dynamic_cast<const ConfigOptionFloats *>(object.config.option(KEY));
    if (values == nullptr || values->values.size() != 3)
        return std::nullopt;
    const Vec3d direction(values->values[0], values->values[1], values->values[2]);
    if (direction.norm() < 1e-6)
        return std::nullopt;
    const Vec3d unit = direction.normalized();
    if (unit.z() > 0.9999)
        return std::nullopt;
    return unit;
}

Vec3d direction_or_up(const ModelObject &object) { return of(object).value_or(Vec3d::UnitZ()); }

std::vector<Slot> gradient_slots(const ConfigBase &config)
{
    std::vector<Slot> slots;
    const auto *mixed_option      = config.option<ConfigOptionBools>("filament_is_mixed");
    const auto *components_option = config.option<ConfigOptionStrings>("filament_mixed_components");
    const auto *gradient_option   = config.option<ConfigOptionBools>("filament_mixed_gradient");
    if (mixed_option == nullptr || components_option == nullptr || gradient_option == nullptr)
        return slots;
    const auto *ranges_option = config.option<ConfigOptionStrings>("filament_mixed_gradient_range");
    const auto *curves_option = config.option<ConfigOptionStrings>("filament_mixed_gradient_curve");
    const std::vector<std::string> none;
    const auto &is_mixed   = mixed_option->values;
    const auto &components = components_option->values;
    const auto &gradient   = gradient_option->values;
    const auto &ranges     = ranges_option ? ranges_option->values : none;
    const auto &curves     = curves_option ? curves_option->values : none;
    for (size_t i = 0; i < is_mixed.size(); ++i) {
        if (!is_mixed[i] || i >= gradient.size() || !gradient[i] || i >= components.size())
            continue;
        const std::vector<unsigned int> parts = parse_mixed_components(components[i]);
        if (parts.size() != 2 || parts[0] == 0 || parts[1] == 0 || parts[0] > is_mixed.size() || parts[1] > is_mixed.size() ||
            is_mixed[parts[0] - 1] || is_mixed[parts[1] - 1])
            continue;
        Slot slot;
        slot.slot   = unsigned(i + 1);
        slot.first  = parts[0];
        slot.second = parts[1];
        // The same reading as the mix's own gradient up the height.
        if (i < ranges.size() && !ranges[i].empty()) {
            CNumericLocalesSetter c_locale;
            float v0 = 0, v1 = 0;
            if (std::sscanf(ranges[i].c_str(), "%f,%f", &v0, &v1) == 2 && v0 > 0 && v0 < 1 && v1 > 0 && v1 < 1) {
                slot.start = v0;
                slot.end   = v1;
            }
        }
        if (i < curves.size() && !curves[i].empty())
            slot.curve = parse_gradient_curve(curves[i]);
        slots.push_back(slot);
    }
    return slots;
}

double first_share(const Slot &slot, double t)
{
    t = std::clamp(t, 0., 1.);
    return slot.curve.empty() ? slot.start + (slot.end - slot.start) * t : sample_gradient_curve(slot.curve, t);
}

namespace {

// Where layer number layer cuts between the filaments: a share in [0, 1). Successive layers spread these out
// evenly (the golden ratio's sequence), so any share is met by about that share of the layers, wherever it is.
double layer_threshold(size_t layer)
{
    const double golden = 0.6180339887498949;
    const double x      = double(layer + 1) * golden;
    return x - std::floor(x);
}

} // namespace

bool first_on_layer(const Slot &slot, double t, size_t layer) { return first_share(slot, t) > layer_threshold(layer); }

std::vector<unsigned int> used_filaments(const ModelObject &object)
{
    std::set<unsigned int> used;
    for (const ModelVolume *volume : object.volumes) {
        if (!volume->is_model_part() && !volume->is_modifier())
            continue;
        if (const int extruder = volume->extruder_id(); extruder > 0)
            used.insert(unsigned(extruder));
        const std::vector<bool> &states = volume->mmu_segmentation_facets.get_data().used_states;
        for (size_t state = size_t(EnforcerBlockerType::Extruder1); state < states.size(); ++state)
            if (states[state])
                used.insert(unsigned(state));
    }
    return {used.begin(), used.end()};
}

std::vector<unsigned int> split_filaments(const ModelObject &object, const ConfigBase &config)
{
    if (!of(object))
        return {};
    const std::vector<unsigned int> used = used_filaments(object);
    std::set<unsigned int>          split;
    for (const Slot &slot : gradient_slots(config))
        if (std::find(used.begin(), used.end(), slot.slot) != used.end()) {
            split.insert(slot.first);
            split.insert(slot.second);
        }
    return {split.begin(), split.end()};
}

void split(const PrintObject &object, std::vector<std::vector<ExPolygons>> &segmentation)
{
    const std::optional<Vec3d> found = of(*object.model_object());
    if (!found || object.layer_count() == 0)
        return;
    const Vec3d direction = *found;
    const size_t filaments = object.print()->config().filament_diameter.size();
    segmentation.resize(object.layer_count());
    for (std::vector<ExPolygons> &layer : segmentation)
        layer.resize(filaments);

    const std::vector<unsigned int> used = used_filaments(*object.model_object());
    std::vector<Slot>               slots;
    for (const Slot &slot : gradient_slots(object.print()->config()))
        if (std::find(used.begin(), used.end(), slot.slot) != used.end() && slot.first <= filaments && slot.second <= filaments &&
            slot.slot <= filaments)
            slots.push_back(slot);
    if (slots.empty())
        return;

    // How far along the direction the object reaches, so the gradient runs from one end of it to the other.
    double low = std::numeric_limits<double>::max(), high = std::numeric_limits<double>::lowest();
    for (size_t layer_id = 0; layer_id < object.layer_count(); ++layer_id) {
        const Layer *layer = object.get_layer(int(layer_id));
        for (size_t region_id = 0; region_id < layer->region_count(); ++region_id)
            for (const Surface &surface : layer->get_region(int(region_id))->slices.surfaces)
                for (const Point &point : surface.expolygon.contour.points) {
                    const double along = direction.x() * unscale<double>(point.x()) + direction.y() * unscale<double>(point.y()) +
                                         direction.z() * layer->slice_z;
                    low  = std::min(low, along);
                    high = std::max(high, along);
                }
    }
    if (high - low < EPSILON)
        return;

    const Vec2d  across_bed(direction.x(), direction.y());
    const double flat = across_bed.norm();
    const Vec2d  along  = flat > 1e-6 ? Vec2d(across_bed / flat) : Vec2d::UnitX();
    const Vec2d  aside(-along.y(), along.x());
    // Past any object on any bed, while staying within the range the polygon clipper handles fastest.
    const double reach = 800.;

    for (size_t layer_id = 0; layer_id < object.layer_count(); ++layer_id) {
        const Layer *layer = object.get_layer(int(layer_id));
        // All the object prints in this layer, and what painting already gives other filaments.
        ExPolygons painted_elsewhere;
        for (size_t filament = 0; filament < filaments; ++filament)
            if (std::none_of(slots.begin(), slots.end(), [filament](const Slot &slot) { return slot.slot == filament + 1; }))
                append(painted_elsewhere, segmentation[layer_id][filament]);

        for (const Slot &slot : slots) {
            // The mix's part of the layer: what's painted with it, and the regions printed with it that no other
            // painting takes over.
            ExPolygons mine = std::move(segmentation[layer_id][slot.slot - 1]);
            segmentation[layer_id][slot.slot - 1].clear();
            ExPolygons regions;
            for (size_t region_id = 0; region_id < layer->region_count(); ++region_id) {
                const LayerRegion *region = layer->get_region(int(region_id));
                if (unsigned(region->region().config().outer_wall_filament_id.value) == slot.slot)
                    for (const Surface &surface : region->slices.surfaces)
                        regions.push_back(surface.expolygon);
            }
            if (!regions.empty())
                append(mine, painted_elsewhere.empty() ? regions : diff_ex(regions, painted_elsewhere));
            if (mine.empty())
                continue;
            mine = union_ex(mine);

            // Where along the direction the first filament prints in this layer: runs of t, sampled finely.
            const int           samples = 256;
            std::vector<double> starts, ends;
            bool                inside = false;
            for (int i = 0; i <= samples; ++i) {
                const double t     = double(i) / samples;
                const bool   first = first_on_layer(slot, t, layer_id);
                if (first && !inside)
                    starts.push_back(i == 0 ? -1. : t - 0.5 / samples);
                if (!first && inside)
                    ends.push_back(t - 0.5 / samples);
                inside = first;
            }
            if (inside)
                ends.push_back(2.);

            ExPolygons first_part;
            if (flat <= 1e-6) {
                // Straight down: the whole layer is one filament.
                const double t = (direction.z() * layer->slice_z - low) / (high - low);
                if (first_on_layer(slot, t, layer_id))
                    first_part = mine;
            } else {
                // Each run is a strip across the bed, between two lines across the direction.
                Polygons strips;
                for (size_t run = 0; run < starts.size(); ++run) {
                    const auto offset = [&](double t) {
                        // Distance along the bed for this t, at this layer's height.
                        const double along_value = low + std::clamp(t, -1., 2.) * (high - low) - direction.z() * layer->slice_z;
                        return along_value / flat;
                    };
                    const double from = starts[run] < 0. ? -reach : offset(starts[run]);
                    const double to   = ends[run] > 1. ? reach : offset(ends[run]);
                    if (to <= from)
                        continue;
                    Polygon strip;
                    for (const Vec2d &corner : {Vec2d(along * from - aside * reach), Vec2d(along * to - aside * reach),
                                                Vec2d(along * to + aside * reach), Vec2d(along * from + aside * reach)})
                        strip.points.emplace_back(scale_(corner.x()), scale_(corner.y()));
                    strips.push_back(std::move(strip));
                }
                if (!strips.empty())
                    first_part = intersection_ex(mine, strips);
            }
            ExPolygons second_part = first_part.empty() ? mine : diff_ex(mine, first_part);
            append(segmentation[layer_id][slot.first - 1], std::move(first_part));
            append(segmentation[layer_id][slot.second - 1], std::move(second_part));
        }
    }
}

} // namespace GradientDirection
} // namespace Slic3r
