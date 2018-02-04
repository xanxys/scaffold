

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
    cmd = "python $(location //nanopb:generator_bin) $(SRCS)",
    tools = ["//nanopb:generator_bin", "//nanopb:generator_lib"],
)
