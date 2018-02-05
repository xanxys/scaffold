

genrule(
    name = "proto_desc",
    srcs = ["builder.proto"],
    outs = ["builder.protodesc"],
    cmd = "protoc -o $(OUTS) $(SRCS)",
)

genrule(
    name = "proto_nanopb",
    srcs = [":proto_desc"],
    outs = ["builder.pb.h", "builder.pb.c"],
    cmd = "python $(location //nanopb:generator_bin) --no-timestamp $(SRCS)",
    tools = ["//nanopb:generator_bin", "//nanopb:generator_lib"],
)

genrule(
    name = "proto_js",
    srcs = ["builder.proto"],
    outs = ["builder.js"],
    local = 1,  # Use locally installed protoc
    cmd = "protoc --proto_path $$(dirname $(location builder.proto)) --js_out=library=builder,binary:$$(dirname $(location builder.js)) $(SRCS)"
)
