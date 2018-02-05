

genrule(
    name = "proto_desc",
    srcs = ["builder.proto"],
    outs = ["builder.protodesc"],
    local = 1,  # Use locally intalled protoc
    cmd = "protoc -o $(OUTS) $(SRCS)",
)

genrule(
    name = "proto_nanopb",
    srcs = [":proto_desc", "builder.options"],
    outs = ["builder.pb.h", "builder.pb.c"],
    cmd = "python $(location //nanopb:generator_bin) --no-timestamp -I $$(dirname $(location builder.options)) -f builder.options $(location :proto_desc)",
    tools = ["//nanopb:generator_bin", "//nanopb:generator_lib"],
)

genrule(
    name = "proto_js",
    srcs = ["builder.proto"],
    outs = ["builder_pb.js"],
    local = 1,  # Use locally installed protoc
    cmd = "protoc --proto_path $$(dirname $(location builder.proto)) --js_out=import_style=commonjs,binary:$$(dirname $(location builder_pb.js)) $(SRCS)"
)
