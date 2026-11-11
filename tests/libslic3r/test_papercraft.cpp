#include <catch2/catch_test_macros.hpp>

#include <cstdlib>
#include <fstream>
#include <map>
#include <string>

#include "libslic3r/ClipperUtils.hpp"
#include "libslic3r/Papercraft.hpp"
#include "libslic3r/TriangleMesh.hpp"

using namespace Slic3r;

namespace {

const Papercraft::Animal animals[] = {Papercraft::Animal::Fox, Papercraft::Animal::Wolf, Papercraft::Animal::Cat,
                                      Papercraft::Animal::Bear, Papercraft::Animal::Rabbit};

// How many times each edge is used each way round: a surface uses each edge once each way, or once at its border.
void check_surface(const indexed_triangle_set &mesh, bool closed)
{
    std::map<std::pair<int, int>, int> directed;
    for (const auto &f : mesh.indices)
        for (int k = 0; k < 3; ++k)
            ++directed[{f[k], f[(k + 1) % 3]}];
    int border = 0;
    for (const auto &[edge, count] : directed) {
        CHECK(count == 1);
        if (directed.find({edge.second, edge.first}) == directed.end())
            ++border;
    }
    if (closed)
        CHECK(border == 0);
    else
        CHECK(border > 0);
}

double net_area(const Papercraft::Net &net)
{
    double sum = 0.;
    for (const FoldBox::Piece &piece : net.pieces)
        sum += area(union_ex(piece.sheet, piece.hinges));
    return sum * SCALING_FACTOR * SCALING_FACTOR;
}

} // namespace

TEST_CASE("A cube unfolds into one cross of six faces", "[Papercraft]")
{
    Papercraft::Params params;
    params.numbers = false;
    const Papercraft::Net net = Papercraft::unfold(its_make_cube(40., 40., 40.), {}, params);
    REQUIRE(net.problem == Papercraft::Problem::None);
    CHECK(net.pieces.size() == 1);
    // Six faces in a tree: five folds, and the other seven edges cut and glued.
    CHECK(net.folds == 5);
    CHECK(net.joins == 7);
    // Every face, and a tab on each cut.
    CHECK(net_area(net) > 6. * 1600. * 0.97);
    CHECK(net_area(net) < 6. * 1600. + 7. * 40. * 7.);
    CHECK(!net.pieces.front().hinges.empty());
    CHECK(area(intersection_ex(net.pieces.front().sheet, net.pieces.front().hinges)) < 1e-3 * area(net.pieces.front().sheet));
}

TEST_CASE("Pieces are split to fit the plate", "[Papercraft]")
{
    Papercraft::Params params;
    params.bed = Vec2d(130., 130.);
    const Papercraft::Net net = Papercraft::unfold(its_make_cube(40., 40., 40.), {}, params);
    REQUIRE(net.problem == Papercraft::Problem::None);
    CHECK(net.pieces.size() > 1);
    for (const FoldBox::Piece &piece : net.pieces) {
        const BoundingBoxf box = piece.size();
        CHECK(box.size().x() <= 130.);
        CHECK(box.size().y() <= 130.);
    }
    params.bed = Vec2d(30., 30.);
    CHECK(Papercraft::unfold(its_make_cube(40., 40., 40.), {}, params).problem == Papercraft::Problem::FaceTooBig);
}

TEST_CASE("Animal masks are surfaces that unfold onto the plate", "[Papercraft]")
{
    Papercraft::Params params;
    for (Papercraft::Animal animal : animals) {
        const Papercraft::Shape mask = Papercraft::mask(animal, 150.);
        check_surface(mask.mesh, false);
        CHECK(mask.holes.size() == 2);
        for (const Papercraft::Shape *shape : {&mask}) {
            const Papercraft::Net net = Papercraft::unfold(shape->mesh, shape->holes, params);
            REQUIRE(net.problem == Papercraft::Problem::None);
            CHECK(net.pieces.size() <= 3);
            double surface = 0.;
            for (const auto &f : shape->mesh.indices)
                surface += 0.5 * (shape->mesh.vertices[f[1]] - shape->mesh.vertices[f[0]]).cross(shape->mesh.vertices[f[2]] - shape->mesh.vertices[f[0]]).norm();
            // Nothing lost but the grooves, cuts and holes, nor overlapping.
            CHECK(net_area(net) > 0.9 * surface);
            for (const FoldBox::Piece &piece : net.pieces) {
                const BoundingBoxf box = piece.size();
                CHECK(box.size().x() <= params.bed.x());
                CHECK(box.size().y() <= params.bed.y());
            }
        }
    }
    // A child's mask is smaller.
    const BoundingBoxf3 adult = bounding_box(Papercraft::mask(Papercraft::Animal::Cat, 150.).mesh);
    const BoundingBoxf3 child = bounding_box(Papercraft::mask(Papercraft::Animal::Cat, 125.).mesh);
    CHECK(child.size().x() < adult.size().x());
}

TEST_CASE("The parts of one thing number their cuts on from each other", "[Papercraft]")
{
    Papercraft::Params params;
    const Papercraft::Net first = Papercraft::unfold(its_make_cube(30., 30., 30.), {}, params);
    params.first_number = 1 + first.joins;
    const Papercraft::Net second = Papercraft::unfold(its_make_cube(30., 30., 30.), {}, params);
    // Two-digit numbers take more room than one-digit ones.
    double marks_first = 0., marks_second = 0.;
    for (const FoldBox::Piece &piece : first.pieces)
        marks_first += area(piece.hinges);
    for (const FoldBox::Piece &piece : second.pieces)
        marks_second += area(piece.hinges);
    CHECK(marks_second > marks_first);
}

TEST_CASE("Pieces are packed onto as few plates as hold them", "[Papercraft]")
{
    Papercraft::Params params;
    params.tabs    = false;
    params.numbers = false;
    std::vector<FoldBox::Piece> pieces;
    // Four nets of six 20 mm squares, each at most 80 mm across.
    for (int i = 0; i < 4; ++i)
        for (FoldBox::Piece &piece : Papercraft::unfold(its_make_cube(20., 20., 20.), {}, params).pieces)
            pieces.push_back(std::move(piece));
    const auto plates = Papercraft::pack(pieces, Vec2d(256., 256.), 4.);
    CHECK(plates.size() == 1);
    size_t placed = 0;
    for (const auto &plate : plates)
        for (const Papercraft::Placement &a : plate) {
            ++placed;
            const Vec2d size = pieces[a.piece].size().size();
            CHECK(a.at.x() + size.x() <= 256.);
            CHECK(a.at.y() + size.y() <= 256.);
            for (const Papercraft::Placement &b : plate) {
                if (a.piece == b.piece)
                    continue;
                const Vec2d other = pieces[b.piece].size().size();
                const bool apart = a.at.x() + size.x() <= b.at.x() || b.at.x() + other.x() <= a.at.x() ||
                                   a.at.y() + size.y() <= b.at.y() || b.at.y() + other.y() <= a.at.y();
                CHECK(apart);
            }
        }
    CHECK(placed == pieces.size());
    // Thirty of them cover more than a plate.
    for (int i = 0; i < 26; ++i)
        for (FoldBox::Piece &piece : Papercraft::unfold(its_make_cube(20., 20., 20.), {}, params).pieces)
            pieces.push_back(std::move(piece));
    CHECK(Papercraft::pack(pieces, Vec2d(256., 256.), 4.).size() > 1);
}

// Writes the shapes and nets for a look: PAPERCRAFT_DUMP=<dir> libslic3r_tests "[.PapercraftDump]"
TEST_CASE("Dump papercraft shapes", "[.PapercraftDump]")
{
    const char *dir = std::getenv("PAPERCRAFT_DUMP");
    REQUIRE(dir);
    const char *names[] = {"fox", "wolf", "cat", "bear", "rabbit"};
    std::ofstream out(std::string(dir) + "/shapes.js");
    out << "window.SHAPES = [";
    const auto loops = [&](const ExPolygons &shape) {
        out << "[";
        bool first = true;
        for (const ExPolygon &e : shape)
            for (const Polygon &p : to_polygons(e)) {
                out << (first ? "" : ",") << "[";
                first = false;
                for (size_t i = 0; i < p.size(); ++i)
                    out << (i ? "," : "") << "[" << unscale<double>(p[i].x()) << "," << unscale<double>(p[i].y()) << "]";
                out << "]";
            }
        out << "]";
    };
    bool first = true;
    for (int i = 0; i < 5; ++i)
        for (bool closed : {false}) {
            const Papercraft::Shape shape = Papercraft::mask(animals[i], 150.);
            const Papercraft::Net   net   = Papercraft::unfold(shape.mesh, shape.holes, Papercraft::Params());
            out << (first ? "" : ",") << "{\"name\":\"" << names[i] << (closed ? " head" : " mask") << "\",\"folds\":" << net.folds
                << ",\"joins\":" << net.joins << ",\"v\":[";
            first = false;
            for (size_t k = 0; k < net.mesh.vertices.size(); ++k)
                out << (k ? "," : "") << "[" << net.mesh.vertices[k].x() << "," << net.mesh.vertices[k].y() << "," << net.mesh.vertices[k].z() << "]";
            out << "],\"f\":[";
            for (size_t k = 0; k < net.mesh.indices.size(); ++k)
                out << (k ? "," : "") << "[" << net.mesh.indices[k][0] << "," << net.mesh.indices[k][1] << "," << net.mesh.indices[k][2] << "]";
            out << "],\"piece\":[";
            for (size_t k = 0; k < net.face_piece.size(); ++k)
                out << (k ? "," : "") << net.face_piece[k];
            out << "],\"pieces\":[";
            for (size_t k = 0; k < net.pieces.size(); ++k) {
                const BoundingBoxf box = net.pieces[k].size();
                out << (k ? "," : "") << "{\"size\":[" << box.size().x() << "," << box.size().y() << "],\"sheet\":";
                loops(net.pieces[k].sheet);
                out << ",\"hinges\":";
                loops(net.pieces[k].hinges);
                out << "}";
            }
            out << "]}";
        }
    out << "];\n";
}

// Unfolds parts read from a text file and writes the plates: PAPERCRAFT_PARTS=<file> PAPERCRAFT_DUMP=<dir>
// libslic3r_tests "[.PapercraftParts]". The file has "part <name>", then "v x y z" and "f a b c" lines.
TEST_CASE("Dump papercraft parts", "[.PapercraftParts]")
{
    const char *in = std::getenv("PAPERCRAFT_PARTS"), *dir = std::getenv("PAPERCRAFT_DUMP");
    REQUIRE(in);
    REQUIRE(dir);
    std::ifstream                                           file(in);
    std::vector<std::pair<std::string, indexed_triangle_set>> parts;
    for (std::string word; file >> word;) {
        if (word == "part") {
            parts.emplace_back();
            file >> parts.back().first;
        } else if (word == "v") {
            float x, y, z;
            file >> x >> y >> z;
            parts.back().second.vertices.emplace_back(x, y, z);
        } else if (word == "f") {
            int a, b, c;
            file >> a >> b >> c;
            parts.back().second.indices.emplace_back(a, b, c);
        }
    }
    Papercraft::Params          params;
    std::vector<FoldBox::Piece> pieces;
    std::vector<int>            piece_part;
    std::ofstream               out(std::string(dir) + "/parts.js");
    out << "window.PARTS = {parts: [";
    for (size_t i = 0; i < parts.size(); ++i) {
        const Papercraft::Net net = Papercraft::unfold(parts[i].second, {}, params);
        REQUIRE(net.problem == Papercraft::Problem::None);
        params.first_number += net.joins;
        out << (i ? "," : "") << "{\"name\":\"" << parts[i].first << "\",\"folds\":" << net.folds << ",\"joins\":" << net.joins
            << ",\"pieces\":" << net.pieces.size() << "}";
        for (const FoldBox::Piece &piece : net.pieces) {
            pieces.push_back(piece);
            piece_part.push_back(int(i));
        }
    }
    out << "], plates: [";
    const auto loops = [&](const ExPolygons &shape, const Vec2d &at) {
        out << "[";
        bool first = true;
        for (const ExPolygon &e : shape)
            for (const Polygon &p : to_polygons(e)) {
                out << (first ? "" : ",") << "[";
                first = false;
                for (size_t k = 0; k < p.size(); ++k)
                    out << (k ? "," : "") << "[" << unscale<double>(p[k].x()) + at.x() << "," << unscale<double>(p[k].y()) + at.y() << "]";
                out << "]";
            }
        out << "]";
    };
    const auto plates = Papercraft::pack(pieces, params.bed, 4.);
    for (size_t p = 0; p < plates.size(); ++p) {
        out << (p ? "," : "") << "[";
        for (size_t k = 0; k < plates[p].size(); ++k) {
            const Papercraft::Placement &a = plates[p][k];
            out << (k ? "," : "") << "{\"part\":" << piece_part[a.piece] << ",\"sheet\":";
            loops(pieces[a.piece].sheet, a.at);
            out << ",\"hinges\":";
            loops(pieces[a.piece].hinges, a.at);
            out << "}";
        }
        out << "]";
    }
    out << "]};\n";
}
